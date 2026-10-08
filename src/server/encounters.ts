import type { EncounterStatus, Prisma, TeamKind } from "@/generated/prisma/client";
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
import { publicPlayerName } from "@/lib/names";
import { type HistoricalMatch, headToHead, recentForm } from "@/lib/odds/history";
import { computeOdds, formatOdds } from "@/lib/odds/model";
import { DomainError } from "./errors";
import { getClubRole, isCaptainInClub, requireClubMember } from "./permissions";
import { refundPendingPredictions } from "./refunds";

type Tx = Prisma.TransactionClient;

export const MAX_MATCHES = 8;

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

/** Calcule et fige les cotes d'un match (A = joueur domicile). */
async function freezeOdds(tx: Tx, matchId: string, now: Date): Promise<void> {
  const m = await tx.match.findUniqueOrThrow({
    where: { id: matchId },
    select: { homePlayer: { select: { id: true, fftRank: true } }, awayPlayer: { select: { id: true, fftRank: true } } },
  });
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

async function validateMatchPlayers(
  tx: Tx,
  e: LoadedEncounter,
  homePlayerId: string,
  awayPlayerId: string,
  ignoreMatchId?: string,
) {
  const [inHome, inAway] = await Promise.all([
    tx.teamPlayer.findUnique({ where: { teamId_playerId: { teamId: e.homeTeam.id, playerId: homePlayerId } } }),
    tx.teamPlayer.findUnique({ where: { teamId_playerId: { teamId: e.awayTeam.id, playerId: awayPlayerId } } }),
  ]);
  if (!inHome) throw new DomainError("INVALID", `Le joueur domicile doit faire partie de l'effectif de ${e.homeTeam.name}`);
  if (!inAway) throw new DomainError("INVALID", `Le joueur extérieur doit faire partie de l'effectif de ${e.awayTeam.name}`);
  // Un seul simple par joueur et par rencontre (les doubles sont hors MVP).
  const busy = await tx.match.findFirst({
    where: {
      encounterId: e.id,
      voidedAt: null,
      id: ignoreMatchId ? { not: ignoreMatchId } : undefined,
      OR: [
        { homePlayerId: { in: [homePlayerId, awayPlayerId] } },
        { awayPlayerId: { in: [homePlayerId, awayPlayerId] } },
      ],
    },
    select: { id: true },
  });
  if (busy) throw new DomainError("INVALID", "Ce joueur dispute déjà un simple dans cette rencontre");
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

export async function addMatch(
  actorId: string,
  encounterId: string,
  players: { homePlayerId: string; awayPlayerId: string },
  now = new Date(),
): Promise<{ id: string }> {
  return db.$transaction(async (tx) => {
    const e = await loadEncounter(tx, encounterId);
    await requireStaff(tx, actorId, e);
    const s = await requireEditable(e, now);
    const active = await tx.match.count({ where: { encounterId, voidedAt: null } });
    if (active >= MAX_MATCHES) throw new DomainError("INVALID", `${MAX_MATCHES} matchs au maximum par rencontre`);
    await validateMatchPlayers(tx, e, players.homePlayerId, players.awayPlayerId);
    const m = await tx.match.create({
      data: { encounterId, order: await nextOrder(tx, encounterId), ...players },
      select: { id: true },
    });
    // Rencontre déjà publiée : le nouveau match reçoit ses cotes tout de suite.
    if (s === "OPEN") await freezeOdds(tx, m.id, now);
    return m;
  });
}

async function loadMatchForEdit(tx: Tx, actorId: string, matchId: string, now: Date) {
  const m = await tx.match.findUnique({ where: { id: matchId }, select: { id: true, encounterId: true, voidedAt: true } });
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

/** Modifie les joueurs d'un match. Publiée : l'ancien match est annulé (remboursements) et remplacé. */
export async function replaceMatch(
  actorId: string,
  matchId: string,
  players: { homePlayerId: string; awayPlayerId: string },
  now = new Date(),
): Promise<{ id: string; refunded: number }> {
  return db.$transaction(async (tx) => {
    const { m, e, s } = await loadMatchForEdit(tx, actorId, matchId, now);
    await validateMatchPlayers(tx, e, players.homePlayerId, players.awayPlayerId, m.id);
    if (s === "DRAFT") {
      await tx.match.update({ where: { id: m.id }, data: players });
      return { id: m.id, refunded: 0 };
    }
    const refunded = await voidMatch(tx, m.id, now);
    const fresh = await tx.match.create({
      data: { encounterId: e.id, order: await nextOrder(tx, e.id), ...players },
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
    number: number;
    home: { name: string; rank: string };
    away: { name: string; rank: string };
    oddsHome: string | null;
    oddsAway: string | null;
    oddsHomeX100: number | null;
    oddsAwayX100: number | null;
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
    matches: { id: string; homePlayerId: string; awayPlayerId: string; homeFull: string; awayFull: string }[];
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

  const matches = await db.match.findMany({
    where: { encounterId, voidedAt: null },
    orderBy: { order: "asc" },
    select: {
      id: true,
      oddsHomeX100: true,
      oddsAwayX100: true,
      homePlayer: { select: { id: true, firstName: true, lastName: true, fftRank: true } },
      awayPlayer: { select: { id: true, firstName: true, lastName: true, fftRank: true } },
    },
  });

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
        homePlayerId: m.homePlayer.id,
        awayPlayerId: m.awayPlayer.id,
        homeFull: `${m.homePlayer.firstName} ${m.homePlayer.lastName}`,
        awayFull: `${m.awayPlayer.firstName} ${m.awayPlayer.lastName}`,
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
    matches: matches.map((m, i) => ({
      id: m.id,
      number: i + 1,
      home: { name: publicPlayerName(m.homePlayer.firstName, m.homePlayer.lastName), rank: fftLabel(m.homePlayer.fftRank) },
      away: { name: publicPlayerName(m.awayPlayer.firstName, m.awayPlayer.lastName), rank: fftLabel(m.awayPlayer.fftRank) },
      oddsHome: m.oddsHomeX100 === null ? null : formatOdds(m.oddsHomeX100),
      oddsAway: m.oddsAwayX100 === null ? null : formatOdds(m.oddsAwayX100),
      oddsHomeX100: m.oddsHomeX100,
      oddsAwayX100: m.oddsAwayX100,
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
};

function toListItems(
  rows: { id: string; status: EncounterStatus; startsAt: Date; predictionsCloseAt: Date; homeTeam: Parameters<typeof sideLabel>[0]; awayTeam: Parameters<typeof sideLabel>[0]; _count: { matches: number } }[],
  now: Date,
): EncounterListItem[] {
  return rows.map((r) => {
    const s = effectiveStatus(r, now);
    return { id: r.id, status: s, statusLabel: STATUS_LABELS[s], startsAt: r.startsAt, home: sideLabel(r.homeTeam), away: sideLabel(r.awayTeam), matchCount: r._count.matches };
  });
}

const listSelect = {
  id: true,
  status: true,
  startsAt: true,
  predictionsCloseAt: true,
  homeTeam: { select: { name: true, kind: true, externalClubName: true, club: { select: { name: true } } } },
  awayTeam: { select: { name: true, kind: true, externalClubName: true, club: { select: { name: true } } } },
  _count: { select: { matches: { where: { voidedAt: null } } } },
} as const;

/** Rencontres d'un club (membres). Les brouillons ne sont listés que pour les admins et capitaines. */
export async function listClubEncounters(actorId: string, clubId: string, now = new Date()): Promise<EncounterListItem[]> {
  await requireClubMember(actorId, clubId);
  const withDrafts = await canSeeDraft(actorId, clubId);
  const rows = await db.encounter.findMany({
    where: { organizerClubId: clubId, ...(withDrafts ? {} : { status: { not: "DRAFT" } }) },
    orderBy: { startsAt: "desc" },
    take: 50,
    select: listSelect,
  });
  return toListItems(rows, now);
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
