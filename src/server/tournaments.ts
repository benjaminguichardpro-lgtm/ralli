import { ODDS_CONFIG } from "@/config/odds";
import type { FftRank, MatchOutcome, Prisma, Side, TournamentStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { fftLabel } from "@/lib/fft";
import { sideName } from "@/lib/matches";
import { headToHead, recentForm } from "@/lib/odds/history";
import { computeOdds, formatOdds } from "@/lib/odds/model";
import { type MatchResult, type SetScore, formatSets, validateResult } from "@/lib/scores/result";
import { type DrawSize, isDrawSize, isFinal, matchesInRound, nextSlot, roundCount } from "@/lib/tournaments/bracket";
import { DomainError } from "./errors";
import { loadHistory } from "./encounters";
import { balanceIn, type MyPrediction } from "./predictions";
import { ADMIN_ONLY, CLUB_NOT_FOUND, getClubRole, requireClubAdmin } from "./permissions";
import { refundPendingPredictions } from "./refunds";
import { settleTournamentMatch } from "./settlement";

type Tx = Prisma.TransactionClient;

// Tournois à élimination directe. Création, publication, annulation et nomination des juges-arbitres : admins du club. Joueurs, tableau,
// heures, infos de l'affiche et résultats : admins ET juges-arbitres du tournoi (membres du club nommés par un admin). Lecture : un tournoi
// publié est visible de tous (page publique du club comprise) ; un brouillon du personnel seulement. Pronostics : membres du club,
// match par match, jamais pour les admins, les juges-arbitres ni les joueurs inscrits. Le résultat saisi règle les pronostics du match
// et fait avancer le vainqueur (pas de seconde confirmation : un tournoi n'a pas d'équipe adverse).

const NOT_FOUND = new DomainError("NOT_FOUND", "Tournoi introuvable");
const MATCH_NOT_FOUND = new DomainError("NOT_FOUND", "Match introuvable");

export const TOURNAMENT_STATUS_LABELS: Record<TournamentStatus, string> = {
  DRAFT: "Brouillon",
  OPEN: "En cours",
  FINISHED: "Terminé",
  CANCELLED: "Annulé",
};

// ─────────────────────────────── Création et préparation (admins) ───────────────────────────────

export type CreateTournamentInput = { name: string; drawSize: number; startsAt: Date };

/** Crée un brouillon avec tous les matchs du tableau (vides) : N − 1 matchs pour N joueurs. */
export async function createTournament(actorId: string, clubId: string, input: CreateTournamentInput): Promise<{ id: string }> {
  await requireClubAdmin(actorId, clubId);
  const name = input.name.trim();
  if (name.length < 2 || name.length > 60) throw new DomainError("INVALID", "Le nom du tournoi : 2 à 60 caractères");
  if (!isDrawSize(input.drawSize)) throw new DomainError("INVALID", "Tableau de 4, 8, 16 ou 32 joueurs");
  const size: DrawSize = input.drawSize;
  return db.$transaction(async (tx) => {
    const club = await tx.club.findFirst({ where: { id: clubId, deletedAt: null }, select: { id: true } });
    if (!club) throw CLUB_NOT_FOUND;
    const t = await tx.tournament.create({ data: { clubId, name, drawSize: size, startsAt: input.startsAt, createdById: actorId }, select: { id: true } });
    const rows: { tournamentId: string; round: number; position: number }[] = [];
    for (let round = 1; round <= roundCount(size); round++) for (let position = 0; position < matchesInRound(size, round); position++) rows.push({ tournamentId: t.id, round, position });
    await tx.tournamentMatch.createMany({ data: rows });
    return t;
  });
}

/** Droits d'admin lus DANS la transaction (une connexion seule ne peut pas servir à la fois la transaction et une lecture à côté). */
async function requireAdminIn(tx: Tx, actorId: string, clubId: string): Promise<void> {
  const role = await getClubRole(actorId, clubId, tx);
  if (!role) throw CLUB_NOT_FOUND;
  if (role !== "ADMIN") throw ADMIN_ONLY;
}

async function loadAdminTournament(tx: Tx, actorId: string, tournamentId: string) {
  const t = await tx.tournament.findUnique({ where: { id: tournamentId }, select: { id: true, clubId: true, drawSize: true, status: true, name: true, club: { select: { deletedAt: true } } } });
  if (!t || t.club.deletedAt) throw NOT_FOUND;
  await requireAdminIn(tx, actorId, t.clubId); // un non-admin (ou non-membre) ne distingue pas « introuvable » de « interdit »
  return t;
}

const NOT_STAFF = new DomainError("FORBIDDEN", "Action réservée aux admins du club et aux juges-arbitres du tournoi");

/** Admin du club ou juge-arbitre du tournoi (droits lus DANS la transaction). Un non-membre ne distingue pas « introuvable » de « interdit ». */
async function requireStaffIn(tx: Tx, actorId: string, t: { id: string; clubId: string }): Promise<void> {
  const role = await getClubRole(actorId, t.clubId, tx);
  if (!role) throw CLUB_NOT_FOUND;
  if (role === "ADMIN") return;
  const ref = await tx.tournamentReferee.findUnique({ where: { tournamentId_userId: { tournamentId: t.id, userId: actorId } }, select: { userId: true } });
  if (!ref) throw NOT_STAFF;
}

async function loadStaffTournament(tx: Tx, actorId: string, tournamentId: string) {
  const t = await tx.tournament.findUnique({ where: { id: tournamentId }, select: { id: true, clubId: true, drawSize: true, status: true, name: true, club: { select: { deletedAt: true } } } });
  if (!t || t.club.deletedAt) throw NOT_FOUND;
  await requireStaffIn(tx, actorId, t);
  return t;
}

const requireDraft = (status: TournamentStatus) => {
  if (status !== "DRAFT") throw new DomainError("INVALID_TRANSITION", "Le tournoi est déjà publié : le tableau ne peut plus être modifié");
};

/** Inscrit un joueur du club (fiche existante). */
export async function addEntry(actorId: string, tournamentId: string, playerId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const t = await loadStaffTournament(tx, actorId, tournamentId);
    requireDraft(t.status);
    const player = await tx.player.findFirst({ where: { id: playerId, clubId: t.clubId }, select: { id: true } });
    if (!player) throw new DomainError("NOT_FOUND", "Joueur introuvable dans ce club");
    await addEntryRow(tx, t, playerId);
  });
}

/** Inscrit un joueur qui n'a pas de fiche (joueur d'un autre club) : la fiche est créée dans le club avec son niveau et son club en texte libre ; elle n'est jamais listée parmi les joueurs du club. */
export async function addNewEntry(actorId: string, tournamentId: string, input: { firstName: string; lastName: string; fftRank: FftRank; clubName?: string }): Promise<{ playerId: string }> {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName || !lastName || firstName.length > 40 || lastName.length > 40) throw new DomainError("INVALID", "Prénom et nom : 1 à 40 caractères");
  const externalClubName = input.clubName?.trim() || null;
  if (externalClubName && externalClubName.length > 60) throw new DomainError("INVALID", "Nom du club : 60 caractères au maximum");
  return db.$transaction(async (tx) => {
    const t = await loadStaffTournament(tx, actorId, tournamentId);
    requireDraft(t.status);
    const p = await tx.player.create({ data: { clubId: t.clubId, firstName, lastName, fftRank: input.fftRank, externalClubName }, select: { id: true } });
    await addEntryRow(tx, t, p.id);
    return { playerId: p.id };
  });
}

async function addEntryRow(tx: Tx, t: { id: string; drawSize: number }, playerId: string) {
  if ((await tx.tournamentEntry.count({ where: { tournamentId: t.id } })) >= t.drawSize) throw new DomainError("INVALID", `Le tableau est complet (${t.drawSize} joueurs)`);
  if (await tx.tournamentEntry.findUnique({ where: { tournamentId_playerId: { tournamentId: t.id, playerId } }, select: { playerId: true } })) {
    throw new DomainError("ALREADY_IN_TEAM", "Ce joueur est déjà inscrit au tournoi");
  }
  await tx.tournamentEntry.create({ data: { tournamentId: t.id, playerId } });
}

/** Retire un joueur inscrit (brouillon) : il quitte aussi le tableau du premier tour. */
export async function removeEntry(actorId: string, tournamentId: string, playerId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const t = await loadStaffTournament(tx, actorId, tournamentId);
    requireDraft(t.status);
    const r = await tx.tournamentEntry.deleteMany({ where: { tournamentId, playerId } });
    if (r.count === 0) throw new DomainError("NOT_FOUND", "Ce joueur n'est pas inscrit");
    await tx.tournamentMatch.updateMany({ where: { tournamentId, round: 1, homePlayerId: playerId }, data: { homePlayerId: null } });
    await tx.tournamentMatch.updateMany({ where: { tournamentId, round: 1, awayPlayerId: playerId }, data: { awayPlayerId: null } });
  });
}

export type FirstRoundPair = { position: number; homePlayerId: string | null; awayPlayerId: string | null; startsAt: Date | null };

/**
 * Saisit le tableau du premier tour à la main (brouillon) : pour chaque match, les deux joueurs et l'heure de début. Les joueurs viennent
 * des inscrits et n'apparaissent qu'une fois. Enregistrement partiel possible (cases vides) ; la publication exige un tableau complet.
 */
export async function setFirstRound(actorId: string, tournamentId: string, pairs: FirstRoundPair[]): Promise<void> {
  await db.$transaction(async (tx) => {
    const t = await loadStaffTournament(tx, actorId, tournamentId);
    requireDraft(t.status);
    const slots = matchesInRound(t.drawSize, 1);
    const entries = new Set((await tx.tournamentEntry.findMany({ where: { tournamentId }, select: { playerId: true } })).map((e) => e.playerId));
    const used = new Set<string>();
    const seenPos = new Set<number>();
    for (const p of pairs) {
      if (!Number.isInteger(p.position) || p.position < 0 || p.position >= slots || seenPos.has(p.position)) throw new DomainError("INVALID", "Tableau incohérent");
      seenPos.add(p.position);
      for (const id of [p.homePlayerId, p.awayPlayerId]) {
        if (id === null) continue;
        if (!entries.has(id)) throw new DomainError("INVALID", "Un joueur du tableau n'est pas inscrit au tournoi");
        if (used.has(id)) throw new DomainError("INVALID", "Un joueur ne peut apparaître qu'une fois dans le premier tour");
        used.add(id);
      }
    }
    for (const p of pairs) {
      await tx.tournamentMatch.update({
        where: { tournamentId_round_position: { tournamentId, round: 1, position: p.position } },
        data: { homePlayerId: p.homePlayerId, awayPlayerId: p.awayPlayerId, startsAt: p.startsAt },
      });
    }
  });
}

/** Publie le tournoi : tableau du premier tour complet (chaque inscrit une fois), heures futures ; les cotes du premier tour sont figées. */
export async function publishTournament(actorId: string, tournamentId: string, now = new Date()): Promise<void> {
  await db.$transaction(async (tx) => {
    const t = await loadAdminTournament(tx, actorId, tournamentId);
    requireDraft(t.status);
    const entries = await tx.tournamentEntry.count({ where: { tournamentId } });
    if (entries !== t.drawSize) throw new DomainError("INVALID", `Il faut ${t.drawSize} joueurs inscrits (il y en a ${entries})`);
    const first = await tx.tournamentMatch.findMany({ where: { tournamentId, round: 1 }, select: { id: true, homePlayerId: true, awayPlayerId: true, startsAt: true } });
    if (first.some((m) => !m.homePlayerId || !m.awayPlayerId)) throw new DomainError("INVALID", "Complète le tableau du premier tour : chaque match a deux joueurs");
    if (first.some((m) => !m.startsAt)) throw new DomainError("INVALID", "Chaque match du premier tour a besoin d'une heure de début");
    if (first.some((m) => m.startsAt!.getTime() <= now.getTime())) throw new DomainError("INVALID", "Les heures de début doivent être dans le futur");
    await tx.tournament.update({ where: { id: tournamentId }, data: { status: "OPEN", publishedAt: now } });
    for (const m of first) await freezeTournamentOdds(tx, m.id, now);
  });
}

/** Supprime un brouillon (rien n'a été publié, aucun pronostic possible). */
export async function deleteDraftTournament(actorId: string, tournamentId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const t = await loadAdminTournament(tx, actorId, tournamentId);
    requireDraft(t.status);
    await tx.tournament.delete({ where: { id: tournamentId } });
  });
}

/** Annule un tournoi publié : tous les pronostics en cours sont remboursés. */
export async function cancelTournament(actorId: string, tournamentId: string, now = new Date()): Promise<{ refunded: number }> {
  return db.$transaction(async (tx) => {
    const t = await loadAdminTournament(tx, actorId, tournamentId);
    if (t.status !== "OPEN" && t.status !== "DRAFT") throw new DomainError("INVALID_TRANSITION", "Seul un tournoi en préparation ou en cours peut être annulé");
    await tx.tournament.update({ where: { id: tournamentId }, data: { status: "CANCELLED" } });
    const refunded = await refundPendingPredictions(tx, { tournamentMatch: { tournamentId } }, now);
    return { refunded };
  });
}

// ─────────────────────────────── Juges-arbitres et infos de l'affiche ───────────────────────────────

/**
 * Nomme un juge-arbitre (admins du club) : un membre simple du club, autant que nécessaire. Un admin a déjà tous les droits ; un joueur
 * inscrit avec un compte lié ne peut pas arbitrer son propre tournoi.
 */
export async function addReferee(actorId: string, tournamentId: string, userId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const t = await loadAdminTournament(tx, actorId, tournamentId);
    if (t.status === "FINISHED" || t.status === "CANCELLED") throw new DomainError("INVALID_TRANSITION", "Ce tournoi est terminé ou annulé");
    const role = await getClubRole(userId, t.clubId, tx);
    if (!role) throw new DomainError("NOT_FOUND", "Cette personne n'est pas membre du club");
    if (role === "ADMIN") throw new DomainError("INVALID", "Cette personne est déjà admin du club : elle a déjà tous les droits");
    if (await tx.tournamentEntry.findFirst({ where: { tournamentId, player: { userId } }, select: { playerId: true } })) throw new DomainError("INVALID", "Cette personne joue le tournoi : elle ne peut pas l'arbitrer");
    if (await tx.tournamentReferee.findUnique({ where: { tournamentId_userId: { tournamentId, userId } }, select: { userId: true } })) throw new DomainError("ALREADY_IN_TEAM", "Cette personne est déjà juge-arbitre du tournoi");
    await tx.tournamentReferee.create({ data: { tournamentId, userId, addedById: actorId } });
  });
}

export async function removeReferee(actorId: string, tournamentId: string, userId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    await loadAdminTournament(tx, actorId, tournamentId);
    const r = await tx.tournamentReferee.deleteMany({ where: { tournamentId, userId } });
    if (r.count === 0) throw new DomainError("NOT_FOUND", "Cette personne n'est pas juge-arbitre du tournoi");
  });
}

/** Sigle du tableau (SM, SD, FT4SD…) et lieu affichés sur l'affiche (admins et juges-arbitres). Vide = non renseigné. */
export async function setTournamentInfo(actorId: string, tournamentId: string, input: { tableLabel: string; venue: string }): Promise<void> {
  const tableLabel = input.tableLabel.trim().toUpperCase() || null;
  const venue = input.venue.trim() || null;
  if (tableLabel && (tableLabel.length > 12 || !/^[A-Z0-9]+$/.test(tableLabel))) throw new DomainError("INVALID", "Sigle du tableau : lettres et chiffres, 12 caractères au maximum (SM, SD, FT4SD…)");
  if (venue && venue.length > 80) throw new DomainError("INVALID", "Lieu : 80 caractères au maximum");
  await db.$transaction(async (tx) => {
    const t = await loadStaffTournament(tx, actorId, tournamentId);
    if (t.status === "CANCELLED") throw new DomainError("INVALID_TRANSITION", "Ce tournoi est annulé");
    await tx.tournament.update({ where: { id: tournamentId }, data: { tableLabel, venue } });
  });
}

// ─────────────────────────────── Cotes ───────────────────────────────

/** Fige les cotes d'un match de tournoi dont les deux joueurs sont connus : niveau, forme et confrontations (matchs d'interclubs confirmés). */
async function freezeTournamentOdds(tx: Tx, matchId: string, now: Date): Promise<void> {
  const sel = { select: { id: true, fftRank: true } } as const;
  const m = await tx.tournamentMatch.findUniqueOrThrow({ where: { id: matchId }, select: { homePlayer: sel, awayPlayer: sel } });
  if (!m.homePlayer || !m.awayPlayer) throw new DomainError("INVALID", "Les deux joueurs doivent être connus pour calculer les cotes");
  const history = await loadHistory(tx, [m.homePlayer.id, m.awayPlayer.id], now);
  const formA = recentForm(m.homePlayer.id, history, ODDS_CONFIG.formWindow);
  const formB = recentForm(m.awayPlayer.id, history, ODDS_CONFIG.formWindow);
  const h2h = headToHead(m.homePlayer.id, m.awayPlayer.id, history);
  const r = computeOdds({ rankA: m.homePlayer.fftRank, rankB: m.awayPlayer.fftRank, formA, formB, h2h });
  await tx.tournamentMatch.update({
    where: { id: matchId },
    data: {
      oddsHomeX100: r.oddsX100A,
      oddsAwayX100: r.oddsX100B,
      oddsComputedAt: now,
      oddsInputs: { configVersion: r.configVersion, rankHome: m.homePlayer.fftRank, rankAway: m.awayPlayer.fftRank, formHome: formA, formAway: formB, h2h, breakdown: r.breakdown, probabilityHome: r.probabilityA, probabilityAway: r.probabilityB },
    },
  });
}

// ─────────────────────────────── Heures et résultats (admins et juges-arbitres) ───────────────────────────────

async function loadMatchForStaff(tx: Tx, actorId: string, matchId: string) {
  const m = await tx.tournamentMatch.findUnique({
    where: { id: matchId },
    select: { id: true, round: true, position: true, startsAt: true, outcome: true, homePlayerId: true, awayPlayerId: true, tournament: { select: { id: true, clubId: true, drawSize: true, status: true, club: { select: { deletedAt: true } } } } },
  });
  if (!m || m.tournament.club.deletedAt) throw MATCH_NOT_FOUND;
  await requireStaffIn(tx, actorId, m.tournament);
  return m;
}

/**
 * Fixe ou change l'heure de début d'un match (admins et juges-arbitres). Les pronostics ferment à cette heure. Impossible une fois le match commencé ou joué ;
 * hors brouillon, l'heure doit être dans le futur. Un match d'un tour suivant peut recevoir son heure avant que ses joueurs soient connus.
 */
export async function setMatchTime(actorId: string, matchId: string, startsAt: Date, now = new Date()): Promise<void> {
  await db.$transaction(async (tx) => {
    const m = await loadMatchForStaff(tx, actorId, matchId);
    if (m.tournament.status !== "OPEN" && m.tournament.status !== "DRAFT") throw new DomainError("INVALID_TRANSITION", "Ce tournoi n'est plus modifiable");
    if (m.outcome) throw new DomainError("INVALID_TRANSITION", "Ce match est déjà joué");
    if (m.startsAt && m.startsAt.getTime() <= now.getTime()) throw new DomainError("INVALID_TRANSITION", "Ce match a commencé : son heure ne peut plus changer");
    if (startsAt.getTime() <= now.getTime()) throw new DomainError("INVALID", "L'heure de début doit être dans le futur");
    await tx.tournamentMatch.update({ where: { id: matchId }, data: { startsAt } });
  });
}

/**
 * Saisit le résultat d'un match (admins et juges-arbitres) : une fois l'heure de début passée, quand les deux joueurs sont connus. Le résultat est DÉFINITIF :
 * il règle tout de suite les pronostics du match et fait avancer le vainqueur au tour suivant (dont les cotes sont alors figées si l'adversaire
 * est connu). À la finale, le tournoi est terminé. Issues possibles : joué, abandon, WO (toutes donnent un vainqueur).
 */
export async function recordTournamentResult(actorId: string, matchId: string, result: MatchResult, now = new Date()): Promise<void> {
  if (result.outcome === "NOT_PLAYED") throw new DomainError("INVALID", "Un match de tournoi a toujours un vainqueur (joué, abandon ou WO)");
  let clean: MatchResult;
  try {
    clean = validateResult(result);
  } catch (err) {
    throw new DomainError("INVALID", err instanceof Error ? err.message : "Résultat invalide");
  }
  await db.$transaction(async (tx) => {
    const m = await loadMatchForStaff(tx, actorId, matchId);
    if (m.tournament.status !== "OPEN") throw new DomainError("INVALID_TRANSITION", "Le tournoi n'est pas en cours");
    if (m.outcome) throw new DomainError("CONFLICT", "Le résultat de ce match est déjà saisi");
    if (!m.homePlayerId || !m.awayPlayerId) throw new DomainError("INVALID_TRANSITION", "Les deux joueurs ne sont pas encore connus");
    if (!m.startsAt || m.startsAt.getTime() > now.getTime()) throw new DomainError("INVALID_TRANSITION", "Le match n'a pas encore commencé : saisis le résultat à partir de l'heure de début");
    const claim = await tx.tournamentMatch.updateMany({
      where: { id: matchId, outcome: null },
      data: { outcome: clean.outcome, winnerSide: clean.winnerSide, sets: clean.sets.length > 0 ? (clean.sets as unknown as Prisma.InputJsonValue) : undefined },
    });
    if (claim.count === 0) throw new DomainError("CONFLICT", "Le résultat de ce match est déjà saisi");
    await settleTournamentMatch(tx, matchId, now); // règlement des pronostics, dans la même transaction

    const winnerId = clean.winnerSide === "HOME" ? m.homePlayerId : m.awayPlayerId;
    const next = nextSlot(m.tournament.drawSize, m.round, m.position);
    if (next) {
      const target = await tx.tournamentMatch.findUniqueOrThrow({
        where: { tournamentId_round_position: { tournamentId: m.tournament.id, round: next.round, position: next.position } },
        select: { id: true, homePlayerId: true, awayPlayerId: true },
      });
      await tx.tournamentMatch.update({ where: { id: target.id }, data: next.side === "HOME" ? { homePlayerId: winnerId } : { awayPlayerId: winnerId } });
      const both = next.side === "HOME" ? target.awayPlayerId : target.homePlayerId;
      if (both) await freezeTournamentOdds(tx, target.id, now);
    } else if (isFinal(m.tournament.drawSize, m.round)) {
      await tx.tournament.update({ where: { id: m.tournament.id }, data: { status: "FINISHED", finishedAt: now, winnerId } });
    }
  });
}

// ─────────────────────────────── Lecture ───────────────────────────────

export type TournamentMatchState = "waiting" | "needs-time" | "open" | "closed" | "done";

export type TournamentMatchView = {
  id: string;
  round: number;
  position: number;
  home: { id: string; name: string; rank: string } | null;
  away: { id: string; name: string; rank: string } | null;
  startsAt: Date | null;
  oddsHomeX100: number | null;
  oddsAwayX100: number | null;
  oddsHome: string | null;
  oddsAway: string | null;
  /** waiting : joueurs pas encore connus ; needs-time : joueurs connus, pas d'heure ; open : pronostics ouverts ; closed : commencé, résultat à venir ; done : joué. */
  state: TournamentMatchState;
  result: null | { winnerSide: Side; winnerName: string; outcome: MatchOutcome; sets: string };
  predictorCount: number;
};

export type TournamentPageView = {
  id: string;
  clubId: string;
  clubName: string;
  name: string;
  status: TournamentStatus;
  statusLabel: string;
  drawSize: number;
  startsAt: Date;
  winner: string | null;
  isAdmin: boolean;
  /** Admin du club ou juge-arbitre du tournoi : prépare le tableau, fixe les heures, saisit les résultats. */
  isStaff: boolean;
  isMember: boolean;
  tableLabel: string | null;
  venue: string | null;
  /** Juges-arbitres (personnel seulement) et membres que l'admin peut encore nommer. */
  referees: { userId: string; name: string }[];
  refereeCandidates: { userId: string; name: string }[];
  rounds: { round: number; matches: TournamentMatchView[] }[];
  /** Inscrits (admins, brouillon ou non) : sert à saisir le tableau. */
  entries: { playerId: string; name: string; fullName: string; rank: string }[];
  /** Fiches du club pas encore inscrites (choix « Ajouter un joueur du club »), admins seulement. */
  availablePlayers: { id: string; name: string; rank: string }[];
};

const playerSel = { select: { id: true, firstName: true, lastName: true, fftRank: true } } as const;

/** La page d'un tournoi. Un brouillon est réservé aux admins du club ; un club supprimé ou un tournoi inconnu : « introuvable ». */
export async function getTournamentPage(viewerId: string | null, tournamentId: string, now = new Date()): Promise<TournamentPageView> {
  const t = await db.tournament.findUnique({
    where: { id: tournamentId },
    select: {
      id: true, clubId: true, name: true, status: true, drawSize: true, startsAt: true, winnerId: true, tableLabel: true, venue: true,
      club: { select: { name: true, deletedAt: true } },
      referees: { select: { userId: true, user: { select: { displayName: true } } }, orderBy: { addedAt: "asc" } },
      entries: { select: { player: playerSel }, orderBy: { addedAt: "asc" } },
      matches: {
        orderBy: [{ round: "asc" }, { position: "asc" }],
        select: { id: true, round: true, position: true, startsAt: true, oddsHomeX100: true, oddsAwayX100: true, outcome: true, winnerSide: true, sets: true, homePlayer: playerSel, awayPlayer: playerSel, _count: { select: { predictions: true } } },
      },
    },
  });
  if (!t || t.club.deletedAt) throw NOT_FOUND;
  const role = viewerId ? await getClubRole(viewerId, t.clubId) : null;
  const isAdmin = role === "ADMIN";
  const isStaff = isAdmin || (role !== null && t.referees.some((r) => r.userId === viewerId));
  if (t.status === "DRAFT" && !isStaff) throw NOT_FOUND;
  const person = (p: { id: string; firstName: string; lastName: string; fftRank: FftRank } | null) => (p ? { id: p.id, name: sideName([p]), rank: fftLabel(p.fftRank) } : null);

  const matches: TournamentMatchView[] = t.matches.map((m) => {
    const state: TournamentMatchState = m.outcome
      ? "done"
      : !m.homePlayer || !m.awayPlayer
        ? "waiting"
        : !m.startsAt
          ? "needs-time"
          : m.startsAt.getTime() > now.getTime() && t.status === "OPEN" && m.oddsHomeX100 !== null
            ? "open"
            : "closed";
    return {
      id: m.id,
      round: m.round,
      position: m.position,
      home: person(m.homePlayer),
      away: person(m.awayPlayer),
      startsAt: m.startsAt,
      oddsHomeX100: m.oddsHomeX100,
      oddsAwayX100: m.oddsAwayX100,
      oddsHome: m.oddsHomeX100 === null ? null : formatOdds(m.oddsHomeX100),
      oddsAway: m.oddsAwayX100 === null ? null : formatOdds(m.oddsAwayX100),
      state,
      result: m.outcome && m.winnerSide ? { winnerSide: m.winnerSide, winnerName: sideName([m.winnerSide === "HOME" ? m.homePlayer! : m.awayPlayer!]), outcome: m.outcome, sets: formatSets((m.sets as SetScore[] | null) ?? []) } : null,
      predictorCount: m._count.predictions,
    };
  });
  const rounds = Array.from({ length: roundCount(t.drawSize) }, (_, i) => ({ round: i + 1, matches: matches.filter((m) => m.round === i + 1) }));
  const winner = t.winnerId ? (await db.player.findUnique({ where: { id: t.winnerId }, select: { firstName: true, lastName: true } })) : null;

  let availablePlayers: TournamentPageView["availablePlayers"] = [];
  if (isStaff && t.status === "DRAFT") {
    const taken = new Set(t.entries.map((e) => e.player.id));
    const club = await db.player.findMany({ where: { clubId: t.clubId, externalClubName: null }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], select: { id: true, firstName: true, lastName: true, fftRank: true } });
    availablePlayers = club.filter((p) => !taken.has(p.id)).map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`, rank: fftLabel(p.fftRank) }));
  }
  let refereeCandidates: TournamentPageView["refereeCandidates"] = [];
  if (isAdmin && (t.status === "DRAFT" || t.status === "OPEN")) {
    const taken = new Set(t.referees.map((r) => r.userId));
    const members = await db.clubMembership.findMany({ where: { clubId: t.clubId, role: "MEMBER" }, select: { userId: true, user: { select: { displayName: true } } }, orderBy: { joinedAt: "asc" } });
    refereeCandidates = members.filter((m) => !taken.has(m.userId)).map((m) => ({ userId: m.userId, name: m.user.displayName })).sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }
  return {
    id: t.id,
    clubId: t.clubId,
    clubName: t.club.name,
    name: t.name,
    status: t.status,
    statusLabel: TOURNAMENT_STATUS_LABELS[t.status],
    drawSize: t.drawSize,
    startsAt: t.startsAt,
    winner: winner ? sideName([winner]) : null,
    isAdmin,
    isStaff,
    isMember: role !== null,
    tableLabel: t.tableLabel,
    venue: t.venue,
    referees: isStaff ? t.referees.map((r) => ({ userId: r.userId, name: r.user.displayName })) : [],
    refereeCandidates,
    rounds,
    entries: isStaff ? t.entries.map((e) => ({ playerId: e.player.id, name: sideName([e.player]), fullName: `${e.player.firstName} ${e.player.lastName}`, rank: fftLabel(e.player.fftRank) })) : [],
    availablePlayers,
  };
}

/** Pronostics du lecteur sur les matchs d'un tournoi, et ce qui l'empêche de pronostiquer (anti-trucage). */
export async function getTournamentPanel(viewerId: string | null, tournamentId: string): Promise<{ isMember: boolean; blockedReason: string | null; balance: number; mine: Record<string, MyPrediction> }> {
  const empty = { isMember: false, blockedReason: null, balance: 0, mine: {} };
  if (!viewerId) return empty;
  const t = await db.tournament.findUnique({ where: { id: tournamentId }, select: { id: true, clubId: true } });
  if (!t || !(await getClubRole(viewerId, t.clubId))) return empty;
  const [blockedReason, balance, rows] = await Promise.all([
    tournamentExclusion(db, viewerId, t),
    balanceIn(db, viewerId),
    db.prediction.findMany({ where: { userId: viewerId, tournamentMatch: { tournamentId } }, select: { tournamentMatchId: true, pickedSide: true, committedAces: true, oddsX100: true, status: true, payoutAces: true } }),
  ]);
  return {
    isMember: true,
    blockedReason,
    balance,
    mine: Object.fromEntries(rows.map((r) => [r.tournamentMatchId!, { side: r.pickedSide, committedAces: r.committedAces, odds: formatOdds(r.oddsX100), status: r.status, payoutAces: r.payoutAces }])),
  };
}

/** Anti-trucage : admins du club, juges-arbitres du tournoi, joueurs inscrits au tournoi et comptes liés à ces joueurs ne pronostiquent pas ce tournoi. */
export async function tournamentExclusion(tx: Tx | typeof db, userId: string, t: { id: string; clubId: string }): Promise<string | null> {
  if ((await getClubRole(userId, t.clubId, tx)) === "ADMIN") return "Les admins ne peuvent pas pronostiquer les matchs de leurs clubs.";
  if (await tx.tournamentReferee.findUnique({ where: { tournamentId_userId: { tournamentId: t.id, userId } }, select: { userId: true } })) return "Tu es juge-arbitre de ce tournoi : tu ne peux pas le pronostiquer.";
  const entered = await tx.tournamentEntry.findFirst({ where: { tournamentId: t.id, player: { userId } }, select: { playerId: true } });
  if (entered) return "Tu es inscrit à ce tournoi : tu ne peux pas le pronostiquer.";
  return null;
}

export type TournamentCard = { id: string; clubId: string; clubName: string; name: string; status: TournamentStatus; statusLabel: string; startsAt: Date; drawSize: number; winner: string | null; openMatches: number };

export const cardSelect = {
  id: true, clubId: true, name: true, status: true, startsAt: true, drawSize: true, winnerId: true,
  club: { select: { name: true } },
  matches: { where: { outcome: null, oddsHomeX100: { not: null } }, select: { startsAt: true } },
} as const;

export async function toCards(rows: Prisma.TournamentGetPayload<{ select: typeof cardSelect }>[], now: Date): Promise<TournamentCard[]> {
  const winnerIds = rows.map((r) => r.winnerId).filter((x): x is string => x !== null);
  const winners = winnerIds.length ? await db.player.findMany({ where: { id: { in: winnerIds } }, select: { id: true, firstName: true, lastName: true } }) : [];
  const byId = new Map(winners.map((w) => [w.id, sideName([w])]));
  return rows.map((r) => ({
    id: r.id,
    clubId: r.clubId,
    clubName: r.club.name,
    name: r.name,
    status: r.status,
    statusLabel: TOURNAMENT_STATUS_LABELS[r.status],
    startsAt: r.startsAt,
    drawSize: r.drawSize,
    winner: r.winnerId ? (byId.get(r.winnerId) ?? null) : null,
    openMatches: r.matches.filter((m) => m.startsAt !== null && m.startsAt.getTime() > now.getTime()).length,
  }));
}

/** Tournois d'un club : publiés pour tout le monde ; brouillons pour les admins (`withDrafts`). Les plus récents d'abord. Annulés exclus. */
export async function listClubTournaments(clubId: string, opts: { withDrafts?: boolean } = {}, now = new Date()): Promise<TournamentCard[]> {
  const rows = await db.tournament.findMany({
    where: { clubId, club: { deletedAt: null }, status: { in: opts.withDrafts ? ["DRAFT", "OPEN", "FINISHED"] : ["OPEN", "FINISHED"] } },
    orderBy: [{ startsAt: "desc" }, { id: "desc" }],
    take: 30,
    select: cardSelect,
  });
  return toCards(rows, now);
}

/** Accueil : tournois publiés des clubs de l'utilisateur, en cours (les plus proches d'abord) et terminés récemment. */
export async function listTournamentsForUser(userId: string, now = new Date()): Promise<{ current: TournamentCard[]; finished: TournamentCard[] }> {
  const base = { club: { deletedAt: null, memberships: { some: { userId } } } };
  const [current, finished] = await Promise.all([
    db.tournament.findMany({ where: { ...base, status: "OPEN" }, orderBy: [{ startsAt: "asc" }, { id: "asc" }], take: 10, select: cardSelect }),
    db.tournament.findMany({ where: { ...base, status: "FINISHED" }, orderBy: [{ finishedAt: "desc" }, { id: "desc" }], take: 5, select: cardSelect }),
  ]);
  return { current: await toCards(current, now), finished: await toCards(finished, now) };
}

/** Vrai si cet identifiant est celui d'un tournoi : /rencontres/<id> y redirige (les listes de pronostics pointent vers « la page » d'un pronostic). */
export async function tournamentExists(id: string): Promise<boolean> {
  return (await db.tournament.count({ where: { id, club: { deletedAt: null }, status: { not: "DRAFT" } } })) > 0;
}
