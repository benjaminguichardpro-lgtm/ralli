import type { EncounterStatus, MatchKind, Prisma, Side, TeamKind } from "@/generated/prisma/client";
import { ODDS_CONFIG } from "@/config/odds";
import { db } from "@/lib/db";
import {
  type EffectiveStatus,
  InvalidTransitionError,
  STATUS_LABELS,
  canDelete,
  canEditComposition,
  canReschedule,
  effectiveStatus,
  nextStatus,
  predictionsCloseAfterReschedule,
} from "@/lib/encounters/state";
import { fftLabel } from "@/lib/fft";
import { type HistoricalMatch, headToHead, recentForm } from "@/lib/odds/history";
import { computeDoublesOdds, computeOdds, formatOdds } from "@/lib/odds/model";
import { type EncounterResult, clubResult } from "@/lib/encounters/filters";
import { MATCH_POINTS, kindWord, numberByKind, sideName, tallyPoints } from "@/lib/matches";
import { DomainError } from "./errors";
import { getClubRole, isCaptainInClub, requireClubMember } from "./permissions";
import { refundPendingPredictions } from "./refunds";

type Tx = Prisma.TransactionClient;

/** Seules une rencontre terminée ou annulée se range dans les archives (une contrainte en base le garantit aussi). */
export const ARCHIVABLE_STATUSES: EncounterStatus[] = ["CONFIRMED", "CANCELLED"];

export const ENCOUNTER_NOT_FOUND = new DomainError("NOT_FOUND", "Rencontre introuvable");
const MATCH_NOT_FOUND = new DomainError("NOT_FOUND", "Match introuvable");
const STAFF_ONLY = new DomainError(
  "FORBIDDEN",
  "Réservé au capitaine de l'équipe du club dans cette rencontre et aux admins du club",
);
const CHANGED = new DomainError("CONFLICT", "La rencontre vient d'être modifiée : rechargez la page");

export function asDomain(e: unknown): never {
  if (e instanceof InvalidTransitionError) throw new DomainError("INVALID_TRANSITION", e.message);
  throw e;
}

// ─────────────────────────────── Chargement et droits ───────────────────────────────

const teamSelect = { id: true, name: true, kind: true, clubId: true, captainId: true, externalClubName: true, club: { select: { name: true } } } as const;

export async function loadEncounter(tx: Tx, id: string) {
  const e = await tx.encounter.findUnique({
    where: { id },
    select: {
      id: true,
      organizerClubId: true,
      status: true,
      startsAt: true,
      predictionsCloseAt: true,
      createdById: true,
      homeTeam: { select: teamSelect },
      awayTeam: { select: teamSelect },
    },
  });
  if (!e) throw ENCOUNTER_NOT_FOUND;
  return e;
}
export type LoadedEncounter = Awaited<ReturnType<typeof loadEncounter>>;

/** L'équipe du club organisateur dans la rencontre (l'autre est l'équipe adverse). */
function clubTeamOf(e: LoadedEncounter) {
  return e.homeTeam.kind === "CLUB" ? e.homeTeam : e.awayTeam;
}

/** Gestion (composer, publier, reporter, annuler) : capitaine de l'équipe du club dans la rencontre, ou admin du club (R7). */
export async function isStaff(actorId: string, e: LoadedEncounter, client: Tx = db): Promise<boolean> {
  if (clubTeamOf(e).captainId === actorId) return true;
  return (await getClubRole(actorId, e.organizerClubId, client)) === "ADMIN";
}

export async function requireStaff(tx: Tx, actorId: string, e: LoadedEncounter): Promise<void> {
  if (await isStaff(actorId, e, tx)) return;
  // Un non-membre ne distingue pas « inexistante » de « interdite ».
  if (!(await getClubRole(actorId, e.organizerClubId, tx))) throw ENCOUNTER_NOT_FOUND;
  throw STAFF_ONLY;
}

/** Brouillon visible des admins et capitaines du club organisateur (R8). */
async function canSeeDraft(viewerId: string | null, clubId: string): Promise<boolean> {
  if (!viewerId) return false;
  const role = await getClubRole(viewerId, clubId);
  if (role === "ADMIN") return true;
  return role !== null && (await isCaptainInClub(viewerId, clubId));
}

function requireFuture(startsAt: Date, now: Date) {
  if (startsAt.getTime() <= now.getTime()) {
    throw new DomainError("INVALID", "L'heure de début doit être dans le futur");
  }
}

/** Passe d'un statut stocké attendu à un autre, en échouant si quelqu'un l'a changé entre-temps. */
export async function guardedStatusUpdate(
  tx: Tx,
  id: string,
  expected: EncounterStatus,
  data: Prisma.EncounterUpdateManyMutationInput,
) {
  const r = await tx.encounter.updateMany({ where: { id, status: expected }, data });
  if (r.count === 0) throw CHANGED;
}

export async function logEvent(
  tx: Tx,
  e: { id: string; status: EncounterStatus },
  toStatus: EncounterStatus,
  actorId: string,
  note?: string,
  payload?: Prisma.InputJsonValue,
) {
  await tx.encounterEvent.create({
    data: { encounterId: e.id, fromStatus: e.status, toStatus, actorId, note, payload },
  });
}

// ─────────────────────────────── Cotes ───────────────────────────────

/** Matchs confirmés antérieurs impliquant ces joueurs (WO / non joués filtrés par history.ts). */
async function loadHistory(tx: Tx, playerIds: string[], before: Date): Promise<HistoricalMatch[]> {
  const rows = await tx.match.findMany({
    where: {
      voidedAt: null,
      outcome: { not: null },
      kind: "SINGLES", // la forme et les confrontations ne viennent que des simples
      encounter: { status: "CONFIRMED", startsAt: { lt: before } },
      OR: [{ homePlayerId: { in: playerIds } }, { awayPlayerId: { in: playerIds } }],
    },
    select: { homePlayerId: true, awayPlayerId: true, outcome: true, winnerSide: true, order: true, encounter: { select: { startsAt: true } } },
  });
  return rows.map((r) => ({
    homePlayerId: r.homePlayerId,
    awayPlayerId: r.awayPlayerId,
    outcome: r.outcome!,
    winnerSide: r.winnerSide,
    order: r.order,
    playedAt: r.encounter.startsAt,
  }));
}

/** Calcule et fige les cotes d'un match (A = joueur ou paire domicile). Simple : niveau, forme, confrontations. Double : moyenne des niveaux. */
async function freezeOdds(tx: Tx, matchId: string, now: Date): Promise<void> {
  const playerSel = { select: { id: true, fftRank: true } } as const;
  const m = await tx.match.findUniqueOrThrow({
    where: { id: matchId },
    select: { kind: true, homePlayer: playerSel, awayPlayer: playerSel, homePlayer2: playerSel, awayPlayer2: playerSel },
  });

  if (m.kind === "DOUBLES") {
    const r = computeDoublesOdds({
      ranksA: [m.homePlayer.fftRank, m.homePlayer2!.fftRank],
      ranksB: [m.awayPlayer.fftRank, m.awayPlayer2!.fftRank],
    });
    await tx.match.update({
      where: { id: matchId },
      data: {
        oddsHomeX100: r.oddsX100A,
        oddsAwayX100: r.oddsX100B,
        oddsComputedAt: now,
        oddsInputs: {
          configVersion: r.configVersion,
          kind: "DOUBLES",
          ranksHome: [m.homePlayer.fftRank, m.homePlayer2!.fftRank],
          ranksAway: [m.awayPlayer.fftRank, m.awayPlayer2!.fftRank],
          breakdown: r.breakdown,
          rawProbabilityHome: r.rawProbabilityA,
          probabilityHome: r.probabilityA,
          probabilityAway: r.probabilityB,
        },
      },
    });
    return;
  }

  const history = await loadHistory(tx, [m.homePlayer.id, m.awayPlayer.id], now);
  const formA = recentForm(m.homePlayer.id, history, ODDS_CONFIG.formWindow);
  const formB = recentForm(m.awayPlayer.id, history, ODDS_CONFIG.formWindow);
  const h2h = headToHead(m.homePlayer.id, m.awayPlayer.id, history);
  const r = computeOdds({ rankA: m.homePlayer.fftRank, rankB: m.awayPlayer.fftRank, formA, formB, h2h });
  await tx.match.update({
    where: { id: matchId },
    data: {
      oddsHomeX100: r.oddsX100A,
      oddsAwayX100: r.oddsX100B,
      oddsComputedAt: now,
      oddsInputs: {
        configVersion: r.configVersion,
        rankHome: m.homePlayer.fftRank,
        rankAway: m.awayPlayer.fftRank,
        formHome: formA,
        formAway: formB,
        h2h,
        breakdown: r.breakdown,
        rawProbabilityHome: r.rawProbabilityA,
        probabilityHome: r.probabilityA,
        probabilityAway: r.probabilityB,
      },
    },
  });
}

// ─────────────────────────────── Création ───────────────────────────────

export type CreateEncounterInput = {
  clubTeamId: string;
  opponentTeamId: string;
  clubTeamIsHome: boolean;
  startsAt: Date;
};

/** R1 : capitaine de l'équipe (pour son équipe) ou admin du club. R2 : l'adversaire vient de la liste du club. */
export async function createEncounter(actorId: string, input: CreateEncounterInput, now = new Date()): Promise<{ id: string }> {
  const clubTeam = await db.team.findUnique({ where: { id: input.clubTeamId }, select: { id: true, clubId: true, kind: true, captainId: true } });
  if (!clubTeam || clubTeam.kind !== "CLUB") throw new DomainError("NOT_FOUND", "Équipe introuvable");
  const role = await requireClubMember(actorId, clubTeam.clubId).catch(() => {
    throw new DomainError("NOT_FOUND", "Équipe introuvable");
  });
  if (role !== "ADMIN" && clubTeam.captainId !== actorId) {
    throw new DomainError("FORBIDDEN", "Seuls le capitaine de cette équipe et les admins du club créent ses rencontres");
  }
  const opponent = await db.team.findUnique({ where: { id: input.opponentTeamId }, select: { clubId: true, kind: true } });
  if (!opponent || opponent.kind !== "EXTERNAL" || opponent.clubId !== clubTeam.clubId) {
    throw new DomainError("INVALID", "Choisissez un adversaire dans la liste des équipes adverses du club");
  }
  requireFuture(input.startsAt, now);

  return db.$transaction(async (tx) => {
    const e = await tx.encounter.create({
      data: {
        organizerClubId: clubTeam.clubId,
        homeTeamId: input.clubTeamIsHome ? clubTeam.id : input.opponentTeamId,
        awayTeamId: input.clubTeamIsHome ? input.opponentTeamId : clubTeam.id,
        startsAt: input.startsAt,
        predictionsCloseAt: input.startsAt,
        createdById: actorId,
      },
      select: { id: true, status: true },
    });
    await logEvent(tx, e, "DRAFT", actorId, "Création");
    return { id: e.id };
  });
}

// ─────────────────────────────── Composition ───────────────────────────────

/**
 * Joueurs d'un match. Simple : un joueur par côté. Double : deux joueurs par côté (les deux champs « 2 » renseignés).
 * `points` : 1 ou 2, ce que vaut le match au score final (1 par défaut).
 */
export type MatchSetup = {
  homePlayerId: string;
  awayPlayerId: string;
  homePlayer2Id?: string | null;
  awayPlayer2Id?: string | null;
  points?: number;
};

type ParsedSetup = {
  kind: MatchKind;
  points: number;
  homePlayerId: string;
  awayPlayerId: string;
  homePlayer2Id: string | null;
  awayPlayer2Id: string | null;
};

function parseSetup(input: MatchSetup): ParsedSetup {
  const homePlayer2Id = input.homePlayer2Id || null;
  const awayPlayer2Id = input.awayPlayer2Id || null;
  if ((homePlayer2Id === null) !== (awayPlayer2Id === null)) {
    throw new DomainError("INVALID", "Un double compte deux joueurs de chaque côté");
  }
  const points = input.points ?? 1;
  if (!(MATCH_POINTS as readonly number[]).includes(points)) throw new DomainError("INVALID", "Un match vaut 1 ou 2 points");
  return {
    kind: homePlayer2Id === null ? "SINGLES" : "DOUBLES",
    points,
    homePlayerId: input.homePlayerId,
    awayPlayerId: input.awayPlayerId,
    homePlayer2Id,
    awayPlayer2Id,
  };
}

async function validateMatchPlayers(tx: Tx, e: LoadedEncounter, setup: ParsedSetup, ignoreMatchId?: string) {
  const homeIds = [setup.homePlayerId, ...(setup.homePlayer2Id ? [setup.homePlayer2Id] : [])];
  const awayIds = [setup.awayPlayerId, ...(setup.awayPlayer2Id ? [setup.awayPlayer2Id] : [])];
  if (new Set(homeIds).size !== homeIds.length || new Set(awayIds).size !== awayIds.length) {
    throw new DomainError("INVALID", "Les deux joueurs d'une même paire doivent être différents");
  }
  // Uniquement des joueurs de l'équipe : chaque joueur vient de l'effectif de son côté.
  const [inHome, inAway] = await Promise.all([
    tx.teamPlayer.count({ where: { teamId: e.homeTeam.id, playerId: { in: homeIds } } }),
    tx.teamPlayer.count({ where: { teamId: e.awayTeam.id, playerId: { in: awayIds } } }),
  ]);
  const plural = setup.kind === "DOUBLES";
  if (inHome !== homeIds.length) {
    throw new DomainError("INVALID", `${plural ? "Les joueurs domicile doivent faire partie" : "Le joueur domicile doit faire partie"} de l'effectif de ${e.homeTeam.name}`);
  }
  if (inAway !== awayIds.length) {
    throw new DomainError("INVALID", `${plural ? "Les joueurs extérieur doivent faire partie" : "Le joueur extérieur doit faire partie"} de l'effectif de ${e.awayTeam.name}`);
  }
  // Au plus un simple et un double par joueur et par rencontre.
  const all = [...homeIds, ...awayIds];
  const busy = await tx.match.findFirst({
    where: {
      encounterId: e.id,
      voidedAt: null,
      kind: setup.kind,
      id: ignoreMatchId ? { not: ignoreMatchId } : undefined,
      OR: [
        { homePlayerId: { in: all } },
        { awayPlayerId: { in: all } },
        { homePlayer2Id: { in: all } },
        { awayPlayer2Id: { in: all } },
      ],
    },
    select: { id: true },
  });
  if (busy) {
    throw new DomainError(
      "INVALID",
      plural ? "Un de ces joueurs dispute déjà un double dans cette rencontre" : "Ce joueur dispute déjà un simple dans cette rencontre",
    );
  }
}

async function nextOrder(tx: Tx, encounterId: string): Promise<number> {
  // Inclut les matchs annulés : leur numéro reste réservé (contrainte unique encounterId + order).
  const r = await tx.match.aggregate({ where: { encounterId }, _max: { order: true } });
  return (r._max.order ?? 0) + 1;
}

async function requireEditable(e: LoadedEncounter, now: Date): Promise<EffectiveStatus> {
  const s = effectiveStatus(e, now);
  if (!canEditComposition(s)) {
    throw new DomainError("INVALID_TRANSITION", `Composition non modifiable : la rencontre est « ${STATUS_LABELS[s]} »`);
  }
  return s;
}

export async function addMatch(actorId: string, encounterId: string, input: MatchSetup, now = new Date()): Promise<{ id: string }> {
  return db.$transaction(async (tx) => {
    const e = await loadEncounter(tx, encounterId);
    await requireStaff(tx, actorId, e);
    const s = await requireEditable(e, now);
    // Pas de limite du nombre de matchs : il dépend du niveau de la rencontre.
    const setup = parseSetup(input);
    await validateMatchPlayers(tx, e, setup);
    const m = await tx.match.create({
      data: { encounterId, order: await nextOrder(tx, encounterId), ...setup },
      select: { id: true },
    });
    // Rencontre déjà publiée : le nouveau match reçoit ses cotes tout de suite.
    if (s === "OPEN") await freezeOdds(tx, m.id, now);
    return m;
  });
}

async function loadMatchForEdit(tx: Tx, actorId: string, matchId: string, now: Date) {
  const m = await tx.match.findUnique({ where: { id: matchId }, select: { id: true, encounterId: true, voidedAt: true, kind: true } });
  if (!m || m.voidedAt) throw MATCH_NOT_FOUND;
  const e = await loadEncounter(tx, m.encounterId);
  await requireStaff(tx, actorId, e);
  const s = await requireEditable(e, now);
  return { m, e, s };
}

/** Retire un match publié : ses pronostics sont remboursés, la ligne est conservée (historique). */
async function voidMatch(tx: Tx, matchId: string, now: Date): Promise<number> {
  await tx.match.update({ where: { id: matchId }, data: { voidedAt: now } });
  return refundPendingPredictions(tx, { matchId }, now);
}

/** Modifie les joueurs (et les points) d'un match. Publiée : l'ancien match est annulé (remboursements) et remplacé. Un simple reste un simple, un double reste un double. */
export async function replaceMatch(
  actorId: string,
  matchId: string,
  input: MatchSetup,
  now = new Date(),
): Promise<{ id: string; refunded: number }> {
  return db.$transaction(async (tx) => {
    const { m, e, s } = await loadMatchForEdit(tx, actorId, matchId, now);
    const setup = parseSetup(input);
    if (setup.kind !== m.kind) {
      throw new DomainError("INVALID", `Un ${kindWord(m.kind)} ne devient pas un ${kindWord(setup.kind)} : retirez-le et ajoutez-en un nouveau`);
    }
    await validateMatchPlayers(tx, e, setup, m.id);
    if (s === "DRAFT") {
      await tx.match.update({ where: { id: m.id }, data: setup });
      return { id: m.id, refunded: 0 };
    }
    const refunded = await voidMatch(tx, m.id, now);
    const fresh = await tx.match.create({
      data: { encounterId: e.id, order: await nextOrder(tx, e.id), ...setup },
      select: { id: true },
    });
    await freezeOdds(tx, fresh.id, now);
    await logEvent(tx, e, e.status, actorId, "Match modifié", { voidedMatchId: m.id, newMatchId: fresh.id, refunded });
    return { id: fresh.id, refunded };
  });
}

export async function removeMatch(actorId: string, matchId: string, now = new Date()): Promise<{ refunded: number }> {
  return db.$transaction(async (tx) => {
    const { m, e, s } = await loadMatchForEdit(tx, actorId, matchId, now);
    if (s === "DRAFT") {
      await tx.match.delete({ where: { id: m.id } });
      return { refunded: 0 };
    }
    const active = await tx.match.count({ where: { encounterId: e.id, voidedAt: null } });
    if (active <= 1) {
      throw new DomainError("INVALID", "Une rencontre publiée garde au moins un match. Pour tout arrêter, annulez la rencontre.");
    }
    const refunded = await voidMatch(tx, m.id, now);
    await logEvent(tx, e, e.status, actorId, "Match retiré", { voidedMatchId: m.id, refunded });
    return { refunded };
  });
}

// ─────────────────────────────── Cycle de vie ───────────────────────────────

export async function publishEncounter(actorId: string, encounterId: string, now = new Date()): Promise<void> {
  await db
    .$transaction(async (tx) => {
      const e = await loadEncounter(tx, encounterId);
      await requireStaff(tx, actorId, e);
      const to = nextStatus("publish", effectiveStatus(e, now));
      const matches = await tx.match.findMany({ where: { encounterId, voidedAt: null }, select: { id: true } });
      if (matches.length === 0) throw new DomainError("INVALID", "Ajoutez au moins un match avant de publier");
      requireFuture(e.startsAt, now);
      for (const m of matches) await freezeOdds(tx, m.id, now);
      await guardedStatusUpdate(tx, e.id, e.status, { status: to, predictionsCloseAt: e.startsAt });
      await logEvent(tx, e, to, actorId, "Publication");
    })
    .catch(asDomain);
}

export async function rescheduleEncounter(actorId: string, encounterId: string, startsAt: Date, now = new Date()): Promise<void> {
  await db.$transaction(async (tx) => {
    const e = await loadEncounter(tx, encounterId);
    await requireStaff(tx, actorId, e);
    const s = effectiveStatus(e, now);
    if (!canReschedule(s)) {
      throw new DomainError("INVALID_TRANSITION", `Report impossible : la rencontre est « ${STATUS_LABELS[s]} »`);
    }
    requireFuture(startsAt, now);
    // Des résultats saisis en direct ne suivent pas un report : il faut d'abord les effacer.
    if ((await tx.match.count({ where: { encounterId, voidedAt: null, outcome: { not: null } } })) > 0) {
      throw new DomainError("INVALID_TRANSITION", "Report impossible : des résultats sont déjà saisis. Efface-les d'abord.");
    }
    const predictionsCloseAt = predictionsCloseAfterReschedule(e, startsAt, now);
    await guardedStatusUpdate(tx, e.id, e.status, { startsAt, predictionsCloseAt });
    await logEvent(tx, e, e.status, actorId, "Report", {
      from: e.startsAt.toISOString(),
      to: startsAt.toISOString(),
      predictionsStayClosed: s === "LOCKED",
    });
  });
}

export async function cancelEncounter(
  actorId: string,
  encounterId: string,
  reason: string | undefined,
  now = new Date(),
): Promise<{ refunded: number }> {
  return db
    .$transaction(async (tx) => {
      const e = await loadEncounter(tx, encounterId);
      await requireStaff(tx, actorId, e);
      const to = nextStatus("cancel", effectiveStatus(e, now));
      await guardedStatusUpdate(tx, e.id, e.status, { status: to });
      const refunded = await refundPendingPredictions(tx, { match: { encounterId } }, now);
      await logEvent(tx, e, to, actorId, reason?.trim() || "Annulation", { refunded });
      return { refunded };
    })
    .catch(asDomain);
}

/** Range une rencontre terminée ou annulée dans les archives du club : elle sort des listes, rien n'est supprimé ni recalculé. */
export async function archiveEncounter(actorId: string, encounterId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const e = await loadEncounter(tx, encounterId);
    await requireStaff(tx, actorId, e);
    if (!ARCHIVABLE_STATUSES.includes(e.status)) {
      throw new DomainError("INVALID_TRANSITION", "Seule une rencontre terminée ou annulée peut être archivée");
    }
    const r = await tx.encounter.updateMany({
      where: { id: e.id, status: e.status, archivedAt: null },
      data: { archivedAt: new Date(), archivedById: actorId },
    });
    if (r.count === 0) throw new DomainError("CONFLICT", "Cette rencontre est déjà archivée");
    await logEvent(tx, e, e.status, actorId, "Archivée");
  });
}

/** Sort une rencontre des archives : elle réapparaît dans la liste du club. */
export async function unarchiveEncounter(actorId: string, encounterId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const e = await loadEncounter(tx, encounterId);
    await requireStaff(tx, actorId, e);
    const r = await tx.encounter.updateMany({
      where: { id: e.id, archivedAt: { not: null } },
      data: { archivedAt: null, archivedById: null },
    });
    if (r.count === 0) throw new DomainError("CONFLICT", "Cette rencontre n'est pas archivée");
    await logEvent(tx, e, e.status, actorId, "Sortie des archives");
  });
}

export async function deleteDraft(actorId: string, encounterId: string, now = new Date()): Promise<{ clubId: string }> {
  return db.$transaction(async (tx) => {
    const e = await loadEncounter(tx, encounterId);
    await requireStaff(tx, actorId, e);
    if (!canDelete(effectiveStatus(e, now))) throw new DomainError("INVALID_TRANSITION", "Seul un brouillon peut être supprimé");
    await tx.encounter.delete({ where: { id: e.id } });
    return { clubId: e.organizerClubId };
  });
}

// ─────────────────────────────── Lecture ───────────────────────────────

export function sideLabel(t: { name: string; kind: TeamKind; externalClubName: string | null; club: { name: string } }) {
  return t.kind === "CLUB" ? `${t.club.name} · ${t.name}` : t.name;
}

export type EncounterPageView = {
  id: string;
  clubId: string;
  status: EffectiveStatus;
  statusLabel: string;
  startsAt: Date;
  predictionsCloseAt: Date;
  home: string;
  away: string;
  clubTeamIsHome: boolean;
  matches: {
    id: string;
    kind: MatchKind;
    /** Numéro dans son type : Simple 1, Simple 2, Double 1… */
    number: number;
    /** Points que vaut le match au score final. */
    points: number;
    home: { name: string; rank: string };
    away: { name: string; rank: string };
    oddsHome: string | null;
    oddsAway: string | null;
    oddsHomeX100: number | null;
    oddsAwayX100: number | null;
    /** Membres qui ont pronostiqué ce match (nombre seulement, jamais pour qui) : en attente, gagnés ou perdus ; les remboursés ne comptent plus. */
    predictorCount: number;
  }[];
  /** Présent seulement pour le staff (capitaine de l'équipe du club, admins). */
  manage: null | {
    canEditComposition: boolean;
    canReschedule: boolean;
    canPublish: boolean;
    canCancel: boolean;
    canDelete: boolean;
    homeRoster: { id: string; label: string }[];
    awayRoster: { id: string; label: string }[];
    matches: {
      id: string;
      kind: MatchKind;
      number: number;
      points: number;
      homePlayerId: string;
      awayPlayerId: string;
      homePlayer2Id: string | null;
      awayPlayer2Id: string | null;
      homeFull: string;
      awayFull: string;
    }[];
  };
};

/**
 * Page d'une rencontre. Publique (sans compte) dès la publication, avec « Prénom N. » ;
 * brouillon visible seulement des admins et capitaines du club organisateur.
 */
export async function getEncounterPage(viewerId: string | null, encounterId: string, now = new Date()): Promise<EncounterPageView> {
  const e = await loadEncounter(db, encounterId).catch(() => {
    throw ENCOUNTER_NOT_FOUND;
  });
  const s = effectiveStatus(e, now);
  if (s === "DRAFT" && !(await canSeeDraft(viewerId, e.organizerClubId))) throw ENCOUNTER_NOT_FOUND;
  // Club supprimé : ses rencontres ne sont plus lisibles (les pronostics réglés restent dans le portefeuille).
  if ((await db.club.count({ where: { id: e.organizerClubId, deletedAt: null } })) === 0) throw ENCOUNTER_NOT_FOUND;

  const playerSel = { select: { id: true, firstName: true, lastName: true, fftRank: true } } as const;
  const rawMatches = await db.match.findMany({
    where: { encounterId, voidedAt: null },
    orderBy: [{ kind: "asc" }, { order: "asc" }], // les simples d'abord, puis les doubles
    select: {
      id: true,
      kind: true,
      points: true,
      oddsHomeX100: true,
      oddsAwayX100: true,
      homePlayer: playerSel,
      awayPlayer: playerSel,
      homePlayer2: playerSel,
      awayPlayer2: playerSel,
    },
  });
  const matches = numberByKind(rawMatches);
  const counts = await db.prediction.groupBy({
    by: ["matchId"],
    where: { matchId: { in: rawMatches.map((m) => m.id) }, status: { in: ["PENDING", "WON", "LOST"] } },
    _count: { _all: true },
  });
  const predictorsOf = (matchId: string) => counts.find((c) => c.matchId === matchId)?._count._all ?? 0;
  const pair = (a: (typeof rawMatches)[number]["homePlayer"], b: (typeof rawMatches)[number]["homePlayer2"]) => (b ? [a, b] : [a]);

  const staff = viewerId ? await isStaff(viewerId, e) : false;
  let manage: EncounterPageView["manage"] = null;
  if (staff) {
    const roster = async (teamId: string) => {
      const rows = await db.teamPlayer.findMany({
        where: { teamId },
        orderBy: { player: { lastName: "asc" } },
        select: { player: { select: { id: true, firstName: true, lastName: true, fftRank: true } } },
      });
      return rows.map(({ player: p }) => ({ id: p.id, label: `${p.firstName} ${p.lastName} (${fftLabel(p.fftRank)})` }));
    };
    const [homeRoster, awayRoster] = await Promise.all([roster(e.homeTeam.id), roster(e.awayTeam.id)]);
    const canCancelNow = (() => {
      try {
        nextStatus("cancel", s);
        return true;
      } catch {
        return false;
      }
    })();
    manage = {
      canEditComposition: canEditComposition(s),
      canReschedule: canReschedule(s),
      canPublish: s === "DRAFT",
      canCancel: canCancelNow,
      canDelete: canDelete(s),
      homeRoster,
      awayRoster,
      matches: matches.map((m) => ({
        id: m.id,
        kind: m.kind,
        number: m.number,
        points: m.points,
        homePlayerId: m.homePlayer.id,
        awayPlayerId: m.awayPlayer.id,
        homePlayer2Id: m.homePlayer2?.id ?? null,
        awayPlayer2Id: m.awayPlayer2?.id ?? null,
        homeFull: pair(m.homePlayer, m.homePlayer2).map((p) => `${p.firstName} ${p.lastName}`).join(" / "),
        awayFull: pair(m.awayPlayer, m.awayPlayer2).map((p) => `${p.firstName} ${p.lastName}`).join(" / "),
      })),
    };
  }

  return {
    id: e.id,
    clubId: e.organizerClubId,
    status: s,
    statusLabel: STATUS_LABELS[s],
    startsAt: e.startsAt,
    predictionsCloseAt: e.predictionsCloseAt,
    home: sideLabel(e.homeTeam),
    away: sideLabel(e.awayTeam),
    clubTeamIsHome: e.homeTeam.kind === "CLUB",
    matches: matches.map((m) => ({
      id: m.id,
      kind: m.kind,
      number: m.number,
      points: m.points,
      home: { name: sideName(pair(m.homePlayer, m.homePlayer2)), rank: pair(m.homePlayer, m.homePlayer2).map((p) => fftLabel(p.fftRank)).join(" · ") },
      away: { name: sideName(pair(m.awayPlayer, m.awayPlayer2)), rank: pair(m.awayPlayer, m.awayPlayer2).map((p) => fftLabel(p.fftRank)).join(" · ") },
      oddsHome: m.oddsHomeX100 === null ? null : formatOdds(m.oddsHomeX100),
      oddsAway: m.oddsAwayX100 === null ? null : formatOdds(m.oddsAwayX100),
      oddsHomeX100: m.oddsHomeX100,
      oddsAwayX100: m.oddsAwayX100,
      predictorCount: predictorsOf(m.id),
    })),
    manage,
  };
}

export type EncounterListItem = {
  id: string;
  status: EffectiveStatus;
  statusLabel: string;
  startsAt: Date;
  home: string;
  away: string;
  matchCount: number;
  /** Le lecteur peut archiver (ou désarchiver) cette rencontre : elle est terminée ou annulée, et il est admin ou capitaine de l'équipe du club. */
  canArchive: boolean;
  /** Victoire, défaite ou nul pour le club, pour une rencontre terminée (null sinon). */
  result: EncounterResult | null;
};

type ListRow = {
  id: string;
  status: EncounterStatus;
  startsAt: Date;
  predictionsCloseAt: Date;
  homeTeam: Parameters<typeof sideLabel>[0] & { kind: TeamKind; captainId: string | null };
  awayTeam: Parameters<typeof sideLabel>[0] & { kind: TeamKind; captainId: string | null };
  _count: { matches: number };
};

function toListItems(rows: ListRow[], now: Date, viewer?: { userId: string; isAdmin: boolean }): EncounterListItem[] {
  return rows.map((r) => {
    const s = effectiveStatus(r, now);
    const clubTeam = r.homeTeam.kind === "CLUB" ? r.homeTeam : r.awayTeam;
    const canArchive = !!viewer && ARCHIVABLE_STATUSES.includes(r.status) && (viewer.isAdmin || clubTeam.captainId === viewer.userId);
    return {
      id: r.id,
      status: s,
      statusLabel: STATUS_LABELS[s],
      startsAt: r.startsAt,
      home: sideLabel(r.homeTeam),
      away: sideLabel(r.awayTeam),
      matchCount: r._count.matches,
      canArchive,
      result: null,
    };
  });
}

/**
 * Ajoute le résultat (victoire, défaite, nul) aux rencontres terminées, au total des points du score final,
 * et un résultat « provisoire » à celles dont le score est proposé mais pas encore confirmé.
 */
async function attachResults(rows: ListRow[], items: EncounterListItem[]): Promise<EncounterListItem[]> {
  // Score en direct : rencontre ouverte et commencée (statut « verrouillée ») dont au moins un match a un résultat.
  const isLive = (i: number) => rows[i]!.status === "OPEN" && items[i]!.status === "LOCKED";
  const confirmed = rows.filter((r, i) => r.status === "CONFIRMED" || r.status === "SCORE_PROPOSED" || isLive(i)).map((r) => r.id);
  if (confirmed.length === 0) return items;
  const matches = await db.match.findMany({
    where: { encounterId: { in: confirmed }, voidedAt: null },
    select: { encounterId: true, winnerSide: true, points: true },
  });
  const byEncounter = new Map<string, { winnerSide: Side | null; points: number }[]>();
  for (const m of matches) byEncounter.set(m.encounterId, [...(byEncounter.get(m.encounterId) ?? []), m]);
  return items.map((it, i) => {
    const row = rows[i]!;
    if (row.status !== "CONFIRMED" && row.status !== "SCORE_PROPOSED" && !isLive(i)) return it;
    const ms = byEncounter.get(it.id) ?? [];
    const live = isLive(i);
    if (live && !ms.some((m) => m.winnerSide !== null)) return it; // aucun résultat saisi : pas de score à montrer
    return { ...it, result: clubResult(tallyPoints(ms), row.homeTeam.kind === "CLUB", row.status === "SCORE_PROPOSED", live) };
  });
}

const listSelect = {
  id: true,
  status: true,
  startsAt: true,
  predictionsCloseAt: true,
  homeTeam: { select: { name: true, kind: true, captainId: true, externalClubName: true, club: { select: { name: true } } } },
  awayTeam: { select: { name: true, kind: true, captainId: true, externalClubName: true, club: { select: { name: true } } } },
  _count: { select: { matches: { where: { voidedAt: null } } } },
} as const;

/** Rencontres d'un club (membres), hors archives. Les brouillons ne sont listés que pour les admins et capitaines. */
export async function listClubEncounters(actorId: string, clubId: string, now = new Date()): Promise<EncounterListItem[]> {
  const role = await requireClubMember(actorId, clubId);
  const withDrafts = await canSeeDraft(actorId, clubId);
  const rows = await db.encounter.findMany({
    where: { organizerClubId: clubId, archivedAt: null, ...(withDrafts ? {} : { status: { not: "DRAFT" } }) },
    orderBy: { startsAt: "desc" },
    take: 200,
    select: listSelect,
  });
  return attachResults(rows, toListItems(rows, now, { userId: actorId, isAdmin: role === "ADMIN" }));
}

/**
 * Rencontres d'un club visibles de tout compte connecté (les clubs sont publics) : jamais de brouillon ni d'archive.
 * Les rencontres à venir ou en cours d'abord (la plus proche en premier), puis les 5 plus récentes déjà jouées ou annulées.
 */
export async function listPublicClubEncounters(clubId: string, now = new Date()): Promise<{ upcoming: EncounterListItem[]; recent: EncounterListItem[] }> {
  const rows = await db.encounter.findMany({
    where: { organizerClubId: clubId, archivedAt: null, status: { not: "DRAFT" } },
    orderBy: { startsAt: "desc" },
    take: 60,
    select: listSelect,
  });
  const items = await attachResults(rows, toListItems(rows, now));
  const upcoming = items.filter((i) => i.status === "OPEN" || i.status === "LOCKED").sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const recent = items.filter((i) => i.status !== "OPEN" && i.status !== "LOCKED").slice(0, 5);
  return { upcoming, recent };
}

/** Archives du club : visibles des admins et des capitaines seulement (liste vide pour un simple membre). */
export async function listArchivedEncounters(actorId: string, clubId: string, now = new Date()): Promise<EncounterListItem[]> {
  const role = await requireClubMember(actorId, clubId);
  if (!(await canSeeDraft(actorId, clubId))) return [];
  const rows = await db.encounter.findMany({
    where: { organizerClubId: clubId, archivedAt: { not: null } },
    orderBy: { startsAt: "desc" },
    take: 100,
    select: listSelect,
  });
  return attachResults(rows, toListItems(rows, now, { userId: actorId, isAdmin: role === "ADMIN" }));
}

/** Accueil : rencontres publiées et non terminées des clubs de l'utilisateur, les plus proches d'abord. */
export async function listUpcomingForUser(userId: string, now = new Date()): Promise<EncounterListItem[]> {
  const rows = await db.encounter.findMany({
    where: {
      organizerClub: { memberships: { some: { userId } } },
      status: { in: ["OPEN", "SCORE_PROPOSED", "DISPUTED"] },
    },
    orderBy: { startsAt: "asc" },
    take: 10,
    select: listSelect,
  });
  return toListItems(rows, now);
}

/** Choix proposés à la création : équipes que l'acteur peut engager (R1) et adversaires du club (R2). */
export async function getNewEncounterOptions(actorId: string, clubId: string) {
  const role = await requireClubMember(actorId, clubId);
  const teams = await db.team.findMany({
    where: { clubId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, kind: true, captainId: true },
  });
  const clubTeams = teams.filter((t) => t.kind === "CLUB" && (role === "ADMIN" || t.captainId === actorId));
  if (clubTeams.length === 0) {
    throw new DomainError("FORBIDDEN", "Seuls les capitaines et les admins du club créent des rencontres");
  }
  return {
    clubTeams: clubTeams.map((t) => ({ id: t.id, name: t.name })),
    opponents: teams.filter((t) => t.kind === "EXTERNAL").map((t) => ({ id: t.id, name: t.name })),
  };
}
