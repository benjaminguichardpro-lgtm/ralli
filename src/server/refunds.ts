import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

/**
 * Rembourse les pronostics EN ATTENTE correspondant au filtre : statut REFUNDED + écriture
 * PREDICTION_REFUND au ledger. Idempotent : un pronostic déjà réglé ou remboursé est ignoré,
 * et la clé d'idempotence `refund:<id>` empêche tout double crédit.
 * À appeler dans la transaction qui annule le match ou la rencontre.
 */
export async function refundPendingPredictions(tx: Tx, where: Prisma.PredictionWhereInput, now: Date): Promise<number> {
  const pending = await tx.prediction.findMany({
    where: { ...where, status: "PENDING" },
    select: { id: true, userId: true, committedAces: true },
  });
  let refunded = 0;
  for (const p of pending) {
    // Mise à jour conditionnelle : si un autre traitement l'a déjà réglé, on ne fait rien.
    const r = await tx.prediction.updateMany({
      where: { id: p.id, status: "PENDING" },
      data: { status: "REFUNDED", payoutAces: p.committedAces, settledAt: now },
    });
    if (r.count === 0) continue;
    await tx.ledgerEntry.create({
      data: {
        userId: p.userId,
        type: "PREDICTION_REFUND",
        amount: p.committedAces,
        predictionId: p.id,
        idempotencyKey: `refund:${p.id}`,
      },
    });
    refunded++;
  }
  return refunded;
}
