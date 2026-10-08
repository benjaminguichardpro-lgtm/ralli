import { DAILY_LOGIN_BONUS_ACES, STREAK_BONUS_ACES, STREAK_LENGTH_DAYS } from "@/config/game";
import { db } from "@/lib/db";
import { streakFor } from "@/lib/bonus/streak";
import { parisDateKey } from "@/lib/time";
import { DomainError, isUniqueViolation } from "./errors";
import { balanceIn } from "./predictions";

export type DailyBonusResult =
  | { claimed: false }
  | {
      claimed: true;
      /** Jours d'affilée en comptant aujourd'hui. */
      streak: number;
      /** Position dans la série de 7 jours : 1 à 7. */
      position: number;
      length: number;
      dailyAmount: number;
      /** 0 sauf le jour qui complète une série. */
      streakBonus: number;
      total: number;
      balance: number;
    };

const dayOfKey = (key: string) => key.slice(key.lastIndexOf(":") + 1);

/** Jours (Paris) déjà récompensés pour ce compte, tirés des clés d'idempotence du ledger, du plus récent au plus ancien. */
async function rewardedDays(userId: string): Promise<string[]> {
  const rows = await db.ledgerEntry.findMany({
    where: { userId, type: "DAILY_LOGIN_BONUS" },
    orderBy: { idempotencyKey: "desc" }, // « daily:<id>:AAAA-MM-JJ » : l'ordre alphabétique est l'ordre chronologique
    take: 400,
    select: { idempotencyKey: true },
  });
  return rows.map((r) => dayOfKey(r.idempotencyKey));
}

/**
 * Bonus de connexion du jour : +10 Aces à la première ouverture de l'app de la journée (heure de Paris),
 * et +50 en plus le jour qui complète 7 jours d'affilée (7, 14, 21…). Un jour manqué remet la série à 1.
 * Le jour de l'inscription ne donne rien : la série démarre le lendemain.
 * Idempotent : la clé `daily:<compte>:<jour>` est unique, deux appels simultanés ne créditent qu'une fois.
 * Renvoie `claimed: false` quand il n'y a rien à donner (déjà reçu aujourd'hui, ou jour d'inscription).
 */
export async function claimDailyBonus(userId: string, now = new Date()): Promise<DailyBonusResult> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
  if (!user) throw new DomainError("NOT_FOUND", "Compte introuvable");
  const today = parisDateKey(now);
  if (parisDateKey(user.createdAt) === today) return { claimed: false };

  const days = await rewardedDays(userId);
  if (days.includes(today)) return { claimed: false };
  const s = streakFor(today, days);
  const streakBonus = s.completesStreak ? STREAK_BONUS_ACES : 0;

  try {
    await db.$transaction(async (tx) => {
      await tx.ledgerEntry.create({
        data: { userId, type: "DAILY_LOGIN_BONUS", amount: DAILY_LOGIN_BONUS_ACES, idempotencyKey: `daily:${userId}:${today}` },
      });
      if (streakBonus > 0) {
        await tx.ledgerEntry.create({
          data: { userId, type: "STREAK_BONUS", amount: streakBonus, idempotencyKey: `streak:${userId}:${today}` },
        });
      }
    });
  } catch (e) {
    // Un autre appel vient de créditer le même jour : rien à faire de plus.
    if (isUniqueViolation(e)) return { claimed: false };
    throw e;
  }

  return {
    claimed: true,
    streak: s.streak,
    position: s.position,
    length: STREAK_LENGTH_DAYS,
    dailyAmount: DAILY_LOGIN_BONUS_ACES,
    streakBonus,
    total: DAILY_LOGIN_BONUS_ACES + streakBonus,
    balance: await balanceIn(db, userId),
  };
}
