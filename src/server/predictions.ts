import type { Prisma, PredictionStatus, Side } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { effectiveStatus } from "@/lib/encounters/state";
import { sideName } from "@/lib/matches";
import { formatOdds } from "@/lib/odds/model";
import { MIN_COMMITTED_ACES } from "@/lib/predictions/payout";
import { DomainError, isUniqueViolation } from "./errors";
import { getClubRole } from "./permissions";

type Tx = Prisma.TransactionClient;

const MATCH_NOT_FOUND = new DomainError("NOT_FOUND", "Match introuvable");

/**
 * Verrou par utilisateur : deux pronostics simultanés du même compte passent l'un après l'autre,
 * donc le solde est relu après l'engagement précédent (pas de double dépense).
 */
async function lockUser(tx: Tx, userId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
}

export async function balanceIn(tx: Tx, userId: string): Promise<number> {
  const r = await tx.ledgerEntry.aggregate({ where: { userId }, _sum: { amount: true } });
  return r._sum.amount ?? 0;
}

type EncounterForRules = {
  id: string;
  organizerClubId: string;
  homeTeam: { captainId: string | null };
  awayTeam: { captainId: string | null };
};

/**
 * Anti-trucage (décision 6) : motif de refus, ou null si l'utilisateur peut pronostiquer.
 * Exclus : admins du club organisateur, capitaines des deux équipes, joueurs alignés dans la rencontre
 * et comptes liés à ces joueurs.
 */
export async function exclusionReason(tx: Tx, userId: string, e: EncounterForRules): Promise<string | null> {
  if ((await getClubRole(userId, e.organizerClubId, tx)) === "ADMIN") {
    return "Les admins du club ne peuvent pas pronostiquer les rencontres de leur club.";
  }
  if (e.homeTeam.captainId === userId || e.awayTeam.captainId === userId) {
    return "Un capitaine ne peut pas pronostiquer la rencontre de son équipe.";
  }
  const lined = await tx.match.findFirst({
    where: {
      encounterId: e.id,
      voidedAt: null,
      OR: [{ homePlayer: { userId } }, { awayPlayer: { userId } }, { homePlayer2: { userId } }, { awayPlayer2: { userId } }],
    },
    select: { id: true },
  });
  if (lined) return "Vous êtes aligné dans cette rencontre : vous ne pouvez pas la pronostiquer.";
  return null;
}

export type PlaceInput = { matchId: string; side: Side; committedAces: number };

/** Valide et enregistre un pronostic : cote copiée du match, Aces engagés débités au ledger. */
export async function placePrediction(userId: string, input: PlaceInput, now = new Date()): Promise<{ id: string }> {
  const { matchId, side, committedAces } = input;
  if (!Number.isSafeInteger(committedAces) || committedAces < MIN_COMMITTED_ACES) {
    throw new DomainError("INVALID", `Minimum ${MIN_COMMITTED_ACES} Aces, en nombre entier`);
  }
  try {
    return await db.$transaction(async (tx) => {
      await lockUser(tx, userId);
      const m = await tx.match.findUnique({
        where: { id: matchId },
        select: {
          id: true,
          voidedAt: true,
          oddsHomeX100: true,
          oddsAwayX100: true,
          encounter: {
            select: {
              id: true,
              status: true,
              predictionsCloseAt: true,
              organizerClubId: true,
              homeTeam: { select: { captainId: true } },
              awayTeam: { select: { captainId: true } },
            },
          },
        },
      });
      if (!m || m.voidedAt) throw MATCH_NOT_FOUND;
      const e = m.encounter;
      // Un non-membre ne distingue pas « inexistant » de « fermé ».
      if (!(await getClubRole(userId, e.organizerClubId, tx))) throw MATCH_NOT_FOUND;
      if (effectiveStatus(e, now) !== "OPEN") throw new DomainError("INVALID_TRANSITION", "Les pronostics sont fermés pour cette rencontre");
      const reason = await exclusionReason(tx, userId, e);
      if (reason) throw new DomainError("FORBIDDEN", reason);

      const odds = side === "HOME" ? m.oddsHomeX100 : m.oddsAwayX100;
      if (odds === null) throw new DomainError("INVALID", "Les cotes de ce match ne sont pas disponibles");
      if (await tx.prediction.findUnique({ where: { userId_matchId: { userId, matchId } }, select: { id: true } })) {
        throw new DomainError("CONFLICT", "Vous avez déjà pronostiqué ce match");
      }
      const balance = await balanceIn(tx, userId);
      if (committedAces > balance) {
        throw new DomainError("INVALID", `Solde insuffisant : vous avez ${balance.toLocaleString("fr-FR")} Aces`);
      }

      const p = await tx.prediction.create({
        data: { userId, matchId, pickedSide: side, committedAces, oddsX100: odds },
        select: { id: true },
      });
      await tx.ledgerEntry.create({
        data: { userId, type: "PREDICTION_COMMIT", amount: -committedAces, predictionId: p.id, idempotencyKey: `commit:${p.id}` },
      });
      return p;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new DomainError("CONFLICT", "Vous avez déjà pronostiqué ce match");
    throw err;
  }
}

// ─────────────────────────────── Lecture : page rencontre ───────────────────────────────

export type MyPrediction = {
  side: Side;
  committedAces: number;
  odds: string;
  status: PredictionStatus;
  payoutAces: number | null;
};

export type PredictionPanel = {
  /** Connecté et membre du club organisateur. */
  isMember: boolean;
  /** Motif d'exclusion (anti-trucage), null si aucun. */
  blockedReason: string | null;
  balance: number;
  /** Pronostic du lecteur par identifiant de match. */
  mine: Record<string, MyPrediction>;
};

/** Ce que la page d'une rencontre doit savoir du lecteur pour afficher (ou non) le formulaire. */
export async function getPredictionPanel(viewerId: string | null, encounterId: string): Promise<PredictionPanel> {
  const empty: PredictionPanel = { isMember: false, blockedReason: null, balance: 0, mine: {} };
  if (!viewerId) return empty;
  const e = await db.encounter.findUnique({
    where: { id: encounterId },
    select: {
      id: true,
      organizerClubId: true,
      homeTeam: { select: { captainId: true } },
      awayTeam: { select: { captainId: true } },
    },
  });
  if (!e || !(await getClubRole(viewerId, e.organizerClubId))) return empty;
  const [blockedReason, balance, rows] = await Promise.all([
    exclusionReason(db, viewerId, e),
    balanceIn(db, viewerId),
    db.prediction.findMany({
      where: { userId: viewerId, match: { encounterId } },
      select: { matchId: true, pickedSide: true, committedAces: true, oddsX100: true, status: true, payoutAces: true },
    }),
  ]);
  return {
    isMember: true,
    blockedReason,
    balance,
    mine: Object.fromEntries(
      rows.map((r) => [
        r.matchId,
        { side: r.pickedSide, committedAces: r.committedAces, odds: formatOdds(r.oddsX100), status: r.status, payoutAces: r.payoutAces },
      ]),
    ),
  };
}

// ─────────────────────────────── Lecture : portefeuille ───────────────────────────────

export const LEDGER_LABELS = {
  SIGNUP_BONUS: "Bonus d'inscription",
  WEEKLY_BONUS: "Bonus du lundi",
  DAILY_LOGIN_BONUS: "Connexion quotidienne",
  STREAK_BONUS: "Bonus de 7 jours d'affilée",
  PREDICTION_COMMIT: "Aces engagés",
  PREDICTION_PAYOUT: "Aces gagnés",
  PREDICTION_REFUND: "Remboursement",
} as const;

export type WalletView = {
  balance: number;
  /** 20 derniers pronostics terminés (gagnés, perdus, remboursés). */
  settled: { id: string; encounterId: string; matchLabel: string; pickedName: string; committedAces: number; odds: string; status: PredictionStatus; payoutAces: number | null }[];
  /** Aces engagés dans des pronostics en attente. */
  pendingAces: number;
  entries: { id: string; label: string; amount: number; createdAt: Date; encounterId: string | null }[];
  pending: {
    id: string;
    encounterId: string;
    matchLabel: string;
    pickedName: string;
    committedAces: number;
    odds: string;
  }[];
};

export async function getWallet(userId: string): Promise<WalletView> {
  const [balance, entries, pending, settled] = await Promise.all([
    balanceIn(db, userId),
    db.ledgerEntry.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
      select: { id: true, type: true, amount: true, createdAt: true, prediction: { select: { match: { select: { encounterId: true } } } } },
    }),
    db.prediction.findMany({
      where: { userId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        pickedSide: true,
        committedAces: true,
        oddsX100: true,
        match: {
          select: {
            order: true,
            encounterId: true,
            homePlayer: { select: { firstName: true, lastName: true } },
            awayPlayer: { select: { firstName: true, lastName: true } },
            homePlayer2: { select: { firstName: true, lastName: true } },
            awayPlayer2: { select: { firstName: true, lastName: true } },
          },
        },
      },
    }),
    db.prediction.findMany({
      where: { userId, status: { not: "PENDING" } },
      orderBy: [{ settledAt: "desc" }, { id: "desc" }],
      take: 20,
      select: {
        id: true,
        pickedSide: true,
        committedAces: true,
        oddsX100: true,
        status: true,
        payoutAces: true,
        match: {
          select: {
            encounterId: true,
            homePlayer: { select: { firstName: true, lastName: true } },
            awayPlayer: { select: { firstName: true, lastName: true } },
            homePlayer2: { select: { firstName: true, lastName: true } },
            awayPlayer2: { select: { firstName: true, lastName: true } },
          },
        },
      },
    }),
  ]);
  type Person = { firstName: string; lastName: string };
  const home = (m: { homePlayer: Person; homePlayer2: Person | null }) => sideName(m.homePlayer2 ? [m.homePlayer, m.homePlayer2] : [m.homePlayer]);
  const away = (m: { awayPlayer: Person; awayPlayer2: Person | null }) => sideName(m.awayPlayer2 ? [m.awayPlayer, m.awayPlayer2] : [m.awayPlayer]);
  return {
    balance,
    pendingAces: pending.reduce((s, p) => s + p.committedAces, 0),
    entries: entries.map((x) => ({
      id: x.id,
      label: LEDGER_LABELS[x.type],
      amount: x.amount,
      createdAt: x.createdAt,
      encounterId: x.prediction?.match.encounterId ?? null,
    })),
    settled: settled.map((p) => ({
      id: p.id,
      encounterId: p.match.encounterId,
      matchLabel: `${home(p.match)} contre ${away(p.match)}`,
      pickedName: p.pickedSide === "HOME" ? home(p.match) : away(p.match),
      committedAces: p.committedAces,
      odds: formatOdds(p.oddsX100),
      status: p.status,
      payoutAces: p.payoutAces,
    })),
    pending: pending.map((p) => ({
      id: p.id,
      encounterId: p.match.encounterId,
      matchLabel: `${home(p.match)} contre ${away(p.match)}`,
      pickedName: p.pickedSide === "HOME" ? home(p.match) : away(p.match),
      committedAces: p.committedAces,
      odds: formatOdds(p.oddsX100),
    })),
  };
}
