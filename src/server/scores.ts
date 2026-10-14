import { Prisma, type MatchKind, type Side } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { STATUS_LABELS, effectiveStatus, nextStatus } from "@/lib/encounters/state";
import { numberByKind, sideName, tallyPoints } from "@/lib/matches";
import { type MatchResult, OUTCOME_LABELS, type SetScore, formatSets, validateResult } from "@/lib/scores/result";
import { DomainError } from "./errors";
import {
  ENCOUNTER_NOT_FOUND,
  type LoadedEncounter,
  asDomain,
  guardedStatusUpdate,
  isStaff,
  loadEncounter,
  logEvent,
  requireStaff,
} from "./encounters";
import { ADMIN_ONLY, getClubRole, isCaptainInClub } from "./permissions";
import { settleEncounter } from "./settlement";

type Tx = Prisma.TransactionClient;

export type MatchResultInput = MatchResult & { matchId: string };

// ─────────────────────────────── Droits ───────────────────────────────

/**
 * Confirmer ou contester (décision S2/S6) : admin du club ou capitaine d'une équipe du club, et jamais l'auteur
 * de la proposition. Un non-membre reçoit « introuvable ».
 */
async function requireReviewer(tx: Tx, actorId: string, e: LoadedEncounter & { scoreProposedById: string | null }, verb: string) {
  const role = await getClubRole(actorId, e.organizerClubId, tx);
  if (!role) throw ENCOUNTER_NOT_FOUND;
  if (role !== "ADMIN" && !(await isCaptainInClub(actorId, e.organizerClubId, tx))) {
    throw new DomainError("FORBIDDEN", "Réservé aux admins du club et aux capitaines de ses équipes");
  }
  if (e.scoreProposedById === actorId) {
    throw new DomainError("FORBIDDEN", `Vous avez proposé ce score : une autre personne doit ${verb}`);
  }
}

async function loadWithProposer(tx: Tx, id: string) {
  const e = await loadEncounter(tx, id);
  const extra = await tx.encounter.findUniqueOrThrow({ where: { id }, select: { scoreProposedById: true } });
  return { ...e, scoreProposedById: extra.scoreProposedById };
}

// ─────────────────────────────── Résultats ───────────────────────────────

const setsJson = (sets: SetScore[]) => (sets.length > 0 ? (sets as unknown as Prisma.InputJsonValue) : Prisma.DbNull);

/** Vérifie que la saisie couvre exactement les matchs actifs (ni oubli, ni doublon, ni match étranger), et la contrôle. */
async function writeResults(tx: Tx, encounterId: string, inputs: MatchResultInput[]): Promise<MatchResultInput[]> {
  const active = await tx.match.findMany({ where: { encounterId, voidedAt: null }, select: { id: true } });
  const ids = new Set(active.map((m) => m.id));
  const seen = new Set<string>();
  for (const r of inputs) {
    if (!ids.has(r.matchId) || seen.has(r.matchId)) throw new DomainError("INVALID", "Résultats incohérents avec les matchs de la rencontre");
    seen.add(r.matchId);
  }
  if (seen.size !== ids.size) throw new DomainError("INVALID", "Indiquez le résultat de chaque match");
  const clean: MatchResultInput[] = [];
  for (const r of inputs) {
    let v: MatchResult;
    try {
      v = validateResult(r);
    } catch (err) {
      throw new DomainError("INVALID", err instanceof Error ? err.message : "Résultat invalide");
    }
    clean.push({ matchId: r.matchId, ...v });
    await tx.match.update({
      where: { id: r.matchId },
      data: { outcome: v.outcome, winnerSide: v.winnerSide, sets: setsJson(v.sets) },
    });
  }
  return clean;
}

const payloadOf = (results: MatchResultInput[]) => ({ results }) as unknown as Prisma.InputJsonValue;

// ─────────────────────────────── Actions ───────────────────────────────

/** S1, S3 : capitaine de l'équipe du club dans la rencontre ou admin, une fois les pronostics fermés. */
export async function proposeScore(actorId: string, encounterId: string, results: MatchResultInput[], now = new Date()): Promise<void> {
  await db
    .$transaction(async (tx) => {
      const e = await loadEncounter(tx, encounterId);
      await requireStaff(tx, actorId, e);
      const to = nextStatus("proposeScore", effectiveStatus(e, now));
      const clean = await writeResults(tx, e.id, results);
      await guardedStatusUpdate(tx, e.id, e.status, { status: to, scoreProposedById: actorId });
      await logEvent(tx, e, to, actorId, "Score proposé", payloadOf(clean));
    })
    .catch(asDomain);
}

/**
 * Saisie en direct : le résultat d'UN match, dès qu'il est terminé, pendant que la rencontre est en cours (commencée, score pas
 * encore proposé). Même droits que la proposition du score (capitaine de l'équipe ou admin). Le résultat est visible de tous,
 * « en direct » ; il reste corrigeable (on saisit à nouveau) jusqu'à la proposition du score final. Aucun pronostic n'est réglé ici :
 * le règlement n'arrive qu'à la confirmation du score final par une seconde personne.
 */
export async function recordLiveResult(actorId: string, matchId: string, result: MatchResult, now = new Date()): Promise<void> {
  let clean: MatchResult;
  try {
    clean = validateResult(result);
  } catch (err) {
    throw new DomainError("INVALID", err instanceof Error ? err.message : "Résultat invalide");
  }
  await db
    .$transaction(async (tx) => {
      const e = await loadLiveMatchEncounter(tx, actorId, matchId, now);
      await tx.match.update({ where: { id: matchId }, data: { outcome: clean.outcome, winnerSide: clean.winnerSide, sets: setsJson(clean.sets) } });
      await logEvent(tx, e, e.status, actorId, "Match saisi en direct", { matchId, result: clean } as unknown as Prisma.InputJsonValue);
    })
    .catch(asDomain);
}

/** Efface le résultat saisi en direct d'un match (erreur de saisie), tant que le score final n'est pas proposé. */
export async function clearLiveResult(actorId: string, matchId: string, now = new Date()): Promise<void> {
  await db
    .$transaction(async (tx) => {
      const e = await loadLiveMatchEncounter(tx, actorId, matchId, now);
      await tx.match.update({ where: { id: matchId }, data: { outcome: null, winnerSide: null, sets: Prisma.DbNull } });
      await logEvent(tx, e, e.status, actorId, "Résultat de match effacé", { matchId });
    })
    .catch(asDomain);
}

/** La rencontre d'un match, si l'acteur peut y saisir en direct : staff, rencontre en cours (commencée, score pas proposé), match actif. */
async function loadLiveMatchEncounter(tx: Tx, actorId: string, matchId: string, now: Date) {
  const m = await tx.match.findUnique({ where: { id: matchId }, select: { encounterId: true, voidedAt: true } });
  if (!m || m.voidedAt) throw new DomainError("NOT_FOUND", "Match introuvable");
  const e = await loadEncounter(tx, m.encounterId);
  await requireStaff(tx, actorId, e);
  if (effectiveStatus(e, now) !== "LOCKED") throw new DomainError("INVALID_TRANSITION", "La saisie en direct est possible une fois la rencontre commencée, tant que le score final n'est pas proposé");
  return e;
}

/** S8 : l'auteur retire sa proposition tant que personne n'a confirmé ni contesté. Les résultats saisis sont effacés. */
export async function withdrawScore(actorId: string, encounterId: string, now = new Date()): Promise<void> {
  await db
    .$transaction(async (tx) => {
      const e = await loadWithProposer(tx, encounterId);
      if (!(await getClubRole(actorId, e.organizerClubId, tx))) throw ENCOUNTER_NOT_FOUND;
      const to = nextStatus("withdrawScore", effectiveStatus(e, now));
      if (e.scoreProposedById !== actorId) throw new DomainError("FORBIDDEN", "Seul l'auteur de la proposition peut la retirer");
      await guardedStatusUpdate(tx, e.id, e.status, { status: to, scoreProposedById: null });
      await tx.match.updateMany({ where: { encounterId: e.id }, data: { outcome: null, winnerSide: null, sets: Prisma.DbNull } });
      await logEvent(tx, e, to, actorId, "Proposition retirée");
    })
    .catch(asDomain);
}

/** S2, S9 : deuxième personne. Le score devient définitif (le règlement des pronostics arrive à la tranche 8). */
export async function confirmScore(actorId: string, encounterId: string, now = new Date()): Promise<void> {
  await db
    .$transaction(async (tx) => {
      const e = await loadWithProposer(tx, encounterId);
      const to = nextStatus("confirmScore", effectiveStatus(e, now));
      await requireReviewer(tx, actorId, e, "le confirmer");
      await guardedStatusUpdate(tx, e.id, e.status, { status: to });
      await logEvent(tx, e, to, actorId, "Score confirmé");
      await settleEncounter(tx, e.id, now); // même transaction : pas de score confirmé sans pronostics réglés
    })
    .catch(asDomain);
}

/** S6 : motif obligatoire. */
export async function disputeScore(actorId: string, encounterId: string, reason: string, now = new Date()): Promise<void> {
  const motif = reason.trim();
  if (!motif) throw new DomainError("INVALID", "Indiquez le motif de la contestation");
  await db
    .$transaction(async (tx) => {
      const e = await loadWithProposer(tx, encounterId);
      const to = nextStatus("disputeScore", effectiveStatus(e, now));
      await requireReviewer(tx, actorId, e, "le contester");
      await guardedStatusUpdate(tx, e.id, e.status, { status: to });
      await logEvent(tx, e, to, actorId, motif);
    })
    .catch(asDomain);
}

/** S7 : un admin du club saisit le score définitif (même s'il a proposé ou contesté). */
export async function resolveDispute(actorId: string, encounterId: string, results: MatchResultInput[], now = new Date()): Promise<void> {
  await db
    .$transaction(async (tx) => {
      const e = await loadEncounter(tx, encounterId);
      const role = await getClubRole(actorId, e.organizerClubId, tx);
      if (!role) throw ENCOUNTER_NOT_FOUND;
      if (role !== "ADMIN") throw ADMIN_ONLY;
      const to = nextStatus("resolveDispute", effectiveStatus(e, now));
      const clean = await writeResults(tx, e.id, results);
      await guardedStatusUpdate(tx, e.id, e.status, { status: to });
      await logEvent(tx, e, to, actorId, "Litige tranché", payloadOf(clean));
      await settleEncounter(tx, e.id, now);
    })
    .catch(asDomain);
}

// ─────────────────────────────── Lecture ───────────────────────────────

export type ScoreMatchView = {
  id: string;
  kind: MatchKind;
  /** Numéro dans son type : Simple 1, Double 1… */
  number: number;
  points: number;
  home: string;
  away: string;
  result: null | { outcome: MatchResult["outcome"]; outcomeLabel: string; winnerSide: Side | null; winnerName: string | null; sets: string };
};

export type ScoreView = {
  matches: ScoreMatchView[];
  /** Points de chaque camp (un match gagné rapporte ses points : 1 ou 2), pour un score définitif ou provisoire. */
  tally: null | { home: number; away: number };
  /** Le score est proposé mais pas encore confirmé : tout le monde le voit, marqué « provisoire ». */
  provisional: boolean;
  /** Rencontre en cours avec au moins un résultat de match saisi : le score se met à jour match par match (visible de tous, pas encore proposé). */
  live: boolean;
  /** Résultats saisis visibles : tout le monde une fois proposés (provisoires) ou confirmés ; un score contesté reste réservé aux admins et capitaines (S11). */
  resultsVisible: boolean;
  staff: boolean;
  proposedBy: string | null;
  disputeReason: string | null;
  actions: { canRecordLive: boolean; canPropose: boolean; canWithdraw: boolean; canConfirm: boolean; canDispute: boolean; canResolve: boolean };
  journal: { id: string; at: Date; actor: string; text: string }[];
};

const NO_ACTIONS = { canRecordLive: false, canPropose: false, canWithdraw: false, canConfirm: false, canDispute: false, canResolve: false };

/** Ce que la page d'une rencontre affiche sur les scores, selon qui regarde. L'appelant a déjà contrôlé l'accès à la page. */
export async function getScoreView(viewerId: string | null, encounterId: string, now = new Date()): Promise<ScoreView> {
  const e = await loadWithProposer(db, encounterId).catch(() => {
    throw ENCOUNTER_NOT_FOUND;
  });
  const status = effectiveStatus(e, now);
  const role = viewerId ? await getClubRole(viewerId, e.organizerClubId) : null;
  const reviewer = role !== null && (role === "ADMIN" || (await isCaptainInClub(viewerId!, e.organizerClubId)));
  const final = status === "CONFIRMED";
  const provisional = status === "SCORE_PROPOSED";
  const liveStatus = status === "LOCKED";
  const resultsVisible = final || provisional || liveStatus || (reviewer && status === "DISPUTED");

  const names = { select: { firstName: true, lastName: true } } as const;
  const rows = numberByKind(
    await db.match.findMany({
      where: { encounterId, voidedAt: null },
      orderBy: [{ kind: "asc" }, { order: "asc" }], // les simples d'abord, puis les doubles
      select: {
        id: true,
        kind: true,
        points: true,
        outcome: true,
        winnerSide: true,
        sets: true,
        homePlayer: names,
        awayPlayer: names,
        homePlayer2: names,
        awayPlayer2: names,
      },
    }),
  );
  const matches: ScoreMatchView[] = rows.map((m) => {
    const home = sideName(m.homePlayer2 ? [m.homePlayer, m.homePlayer2] : [m.homePlayer]);
    const away = sideName(m.awayPlayer2 ? [m.awayPlayer, m.awayPlayer2] : [m.awayPlayer]);
    const showResult = resultsVisible && m.outcome !== null;
    return {
      id: m.id,
      kind: m.kind,
      number: m.number,
      points: m.points,
      home,
      away,
      result: showResult
        ? {
            outcome: m.outcome!,
            outcomeLabel: OUTCOME_LABELS[m.outcome!],
            winnerSide: m.winnerSide,
            winnerName: m.winnerSide === "HOME" ? home : m.winnerSide === "AWAY" ? away : null,
            sets: formatSets((m.sets as SetScore[] | null) ?? []),
          }
        : null,
    };
  });

  const live = liveStatus && rows.some((m) => m.outcome !== null);
  const tally = final || provisional || live ? tallyPoints(rows) : null;

  const staffHere = viewerId ? await isStaff(viewerId, e) : false;
  const mine = e.scoreProposedById === viewerId;
  const actions = viewerId
    ? {
        canRecordLive: staffHere && liveStatus,
        canPropose: staffHere && liveStatus,
        canWithdraw: status === "SCORE_PROPOSED" && mine && role !== null,
        canConfirm: status === "SCORE_PROPOSED" && reviewer && !mine,
        canDispute: status === "SCORE_PROPOSED" && reviewer && !mine,
        canResolve: status === "DISPUTED" && role === "ADMIN",
      }
    : NO_ACTIONS;

  let proposedBy: string | null = null;
  let disputeReason: string | null = null;
  let journal: ScoreView["journal"] = [];
  if (reviewer) {
    if (e.scoreProposedById && (status === "SCORE_PROPOSED" || status === "DISPUTED")) {
      proposedBy = (await db.user.findUnique({ where: { id: e.scoreProposedById }, select: { displayName: true } }))?.displayName ?? null;
    }
    const events = await db.encounterEvent.findMany({
      where: { encounterId },
      orderBy: { createdAt: "asc" },
      select: { id: true, createdAt: true, toStatus: true, note: true, actor: { select: { displayName: true } } },
    });
    journal = events.map((x) => ({
      id: x.id,
      at: x.createdAt,
      actor: x.actor?.displayName ?? "Système",
      text: x.toStatus === "DISPUTED" ? `Score contesté : ${x.note ?? ""}` : (x.note ?? STATUS_LABELS[x.toStatus]),
    }));
    if (status === "DISPUTED") {
      disputeReason = [...events].reverse().find((x) => x.toStatus === "DISPUTED")?.note ?? null;
    }
  }

  return { matches, tally, provisional, live, resultsVisible, staff: reviewer, proposedBy, disputeReason, actions, journal };
}
