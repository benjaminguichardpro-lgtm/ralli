import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { computePayout } from "@/lib/predictions/payout";
import { DomainError } from "./errors";
import { refundPendingPredictions } from "./refunds";

type Tx = Prisma.TransactionClient;

export type SettlementResult = { won: number; lost: number; refunded: number };
const NOTHING: SettlementResult = { won: 0, lost: 0, refunded: 0 };

/**
 * Règle les pronostics d'une rencontre CONFIRMED, à appeler dans la transaction qui la confirme (décision T1).
 * - gagné (joueur choisi = vainqueur, y compris abandon et WO) : Aces gagnés = computePayout, écriture `payout:<id>` ;
 * - perdu : rien n'est rendu ;
 * - match non joué ou retiré : remboursement.
 * Idempotent (T4) : la rencontre n'est réglée qu'une fois (`settledAt`), un pronostic seulement s'il est encore
 * PENDING, et la clé unique du ledger refuse tout doublon. Un appel de plus ne fait rien.
 */
export async function settleEncounter(tx: Tx, encounterId: string, now: Date): Promise<SettlementResult> {
  // Réservation : un seul règlement par rencontre, et seulement si le score est définitif.
  const claim = await tx.encounter.updateMany({ where: { id: encounterId, status: "CONFIRMED", settledAt: null }, data: { settledAt: now } });
  if (claim.count === 0) return { ...NOTHING };

  const pending = await tx.prediction.findMany({
    where: { status: "PENDING", match: { encounterId } },
    select: {
      id: true,
      userId: true,
      pickedSide: true,
      committedAces: true,
      oddsX100: true,
      matchId: true,
      match: { select: { outcome: true, winnerSide: true, voidedAt: true } },
    },
  });

  const result: SettlementResult = { ...NOTHING };
  const toRefund: string[] = [];
  for (const p of pending) {
    const { outcome, winnerSide, voidedAt } = p.match;
    if (voidedAt || outcome === "NOT_PLAYED") {
      toRefund.push(p.matchId);
      continue;
    }
    // Un match actif d'une rencontre confirmée a forcément un résultat : sinon, on annule tout (rollback).
    if (!outcome || !winnerSide) throw new Error(`Règlement impossible : le match ${p.matchId} n'a pas de résultat`);
    if (p.pickedSide === winnerSide) {
      const payout = computePayout(p.committedAces, p.oddsX100);
      const r = await tx.prediction.updateMany({ where: { id: p.id, status: "PENDING" }, data: { status: "WON", payoutAces: payout, settledAt: now } });
      if (r.count === 0) continue;
      await tx.ledgerEntry.create({
        data: { userId: p.userId, type: "PREDICTION_PAYOUT", amount: payout, predictionId: p.id, idempotencyKey: `payout:${p.id}` },
      });
      result.won++;
    } else {
      const r = await tx.prediction.updateMany({ where: { id: p.id, status: "PENDING" }, data: { status: "LOST", payoutAces: 0, settledAt: now } });
      if (r.count > 0) result.lost++;
    }
  }
  if (toRefund.length > 0) result.refunded = await refundPendingPredictions(tx, { matchId: { in: [...new Set(toRefund)] } }, now);
  return result;
}

/**
 * Filet de sécurité (`npm run settle -- <id>`) : règle une rencontre confirmée qui ne l'aurait pas été.
 * Sans effet si elle est déjà réglée.
 */
export async function settleConfirmedEncounter(encounterId: string, now = new Date()): Promise<SettlementResult> {
  return db.$transaction(async (tx) => {
    const e = await tx.encounter.findUnique({ where: { id: encounterId }, select: { status: true } });
    if (!e) throw new DomainError("NOT_FOUND", "Rencontre introuvable");
    if (e.status !== "CONFIRMED") throw new DomainError("INVALID_TRANSITION", "Seule une rencontre au score confirmé peut être réglée");
    return settleEncounter(tx, encounterId, now);
  });
}
