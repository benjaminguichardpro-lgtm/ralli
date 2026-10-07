import { db } from "@/lib/db";

/** Solde d'Aces : toujours dérivé du ledger, jamais stocké. */
export async function getBalance(userId: string): Promise<number> {
  const r = await db.ledgerEntry.aggregate({ where: { userId }, _sum: { amount: true } });
  return r._sum.amount ?? 0;
}
