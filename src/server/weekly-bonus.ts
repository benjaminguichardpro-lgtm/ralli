import { WEEKLY_BONUS_ACES, WEEKLY_BONUS_THRESHOLD_ACES } from "@/config/game";
import { db } from "@/lib/db";
import { isoWeekKey } from "@/lib/time";

/**
 * Bonus du lundi : +200 Aces à chaque compte dont le solde (Aces engagés déjà déduits) est inférieur à 500.
 * Idempotent par semaine ISO : la clé `weekly:<userId>:<semaine>` est unique, relancer ne crédite jamais deux fois.
 */
export async function grantWeeklyBonus(now = new Date()): Promise<{ week: string; granted: number }> {
  const week = isoWeekKey(now);
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT u.id FROM "User" u
    LEFT JOIN "LedgerEntry" l ON l."userId" = u.id
    GROUP BY u.id
    HAVING COALESCE(SUM(l.amount), 0) < ${WEEKLY_BONUS_THRESHOLD_ACES}`;
  const r = await db.ledgerEntry.createMany({
    data: rows.map(({ id }) => ({
      userId: id,
      type: "WEEKLY_BONUS" as const,
      amount: WEEKLY_BONUS_ACES,
      idempotencyKey: `weekly:${id}:${week}`,
    })),
    skipDuplicates: true,
  });
  return { week, granted: r.count };
}
