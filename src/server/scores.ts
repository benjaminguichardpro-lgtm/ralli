import { Prisma, type Side } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { STATUS_LABELS, effectiveStatus, nextStatus } from "@/lib/encounters/state";
import { publicPlayerName } from "@/lib/names";
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
  number: number;
  home: string;
  away: string;
  result: null | { outcome: MatchResult["outcome"]; outcomeLabel: string; winnerSide: Side | null; winnerName: string | null; sets: string };
};

export type ScoreView = {
  matches: ScoreMatchView[];
  /** Victoires de chaque camp, seulement quand le score est définitif. */
  tally: null | { home: number; away: number };
  /** Résultats saisis visibles : tout le monde une fois confirmés, sinon admins et capitaines du club (S11). */
  resultsVisible: boolean;
  staff: boolean;
  proposedBy: string | null;
  disputeReason: string | null;
  actions: { canPropose: boolean; canWithdraw: boolean; canConfirm: boolean; canDispute: boolean; canResolve: boolean };
  journal: { id: string; at: Date; actor: string; text: string }[];
};

const NO_ACTIONS = { canPropose: false, canWithdraw: false, canConfirm: false, canDispute: false, canResolve: false };

/** Ce que la page d'une rencontre affiche sur les scores, selon qui regarde. L'appelant a déjà contrôlé l'accès à la page. */
export async function getScoreView(viewerId: string | null, encounterId: string, now = new Date()): Promise<ScoreView> {
  const e = await loadWithProposer(db, encounterId).catch(() => {
    throw ENCOUNTER_NOT_FOUND;
  });
  const status = effectiveStatus(e, now);
  const role = viewerId ? await getClubRole(viewerId, e.organizerClubId) : null;
  const reviewer = role !== null && (role === "ADMIN" || (await isCaptainInClub(viewerId!, e.organizerClubId)));
  const final = status === "CONFIRMED";
  const resultsVisible = final || (reviewer && (status === "SCORE_PROPOSED" || status === "DISPUTED"));

  const rows = await db.match.findMany({
    where: { encounterId, voidedAt: null },
    orderBy: { order: "asc" },
    select: {
      id: true,
      outcome: true,
      winnerSide: true,
      sets: true,
      homePlayer: { select: { firstName: true, lastName: true } },
      awayPlayer: { select: { firstName: true, lastName: true } },
    },
  });
  const matches: ScoreMatchView[] = rows.map((m, i) => {
    const home = publicPlayerName(m.homePlayer.firstName, m.homePlayer.lastName);
    const away = publicPlayerName(m.awayPlayer.firstName, m.awayPlayer.lastName);
    const showResult = resultsVisible && m.outcome !== null;
    return {
      id: m.id,
      number: i + 1,
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

  const tally = final
    ? { home: rows.filter((m) => m.winnerSide === "HOME").length, away: rows.filter((m) => m.winnerSide === "AWAY").length }
    : null;

  const staffHere = viewerId ? await isStaff(viewerId, e) : false;
  const mine = e.scoreProposedById === viewerId;
  const actions = viewerId
    ? {
        canPropose: staffHere && status === "LOCKED",
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

  return { matches, tally, resultsVisible, staff: reviewer, proposedBy, disputeReason, actions, journal };
}
