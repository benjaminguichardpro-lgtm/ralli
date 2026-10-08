// Série de connexions quotidiennes : calcul pur sur des jours « AAAA-MM-JJ » (jours de Paris).

import { STREAK_LENGTH_DAYS } from "@/config/game";

/** Jour précédent d'une date « AAAA-MM-JJ » (calcul calendaire, sans heure donc sans changement d'heure). */
export function previousDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

export type StreakResult = {
  /** Nombre de jours d'affilée en comptant aujourd'hui (1 = série qui démarre). */
  streak: number;
  /** Position dans la série de STREAK_LENGTH_DAYS jours : 1 à 7. */
  position: number;
  /** Vrai le jour qui complète une série (7, 14, 21…) : le bonus de série est dû. */
  completesStreak: boolean;
};

/**
 * Série du jour `today` : les jours déjà récompensés (`rewardedDays`, dans n'importe quel ordre) qui se suivent
 * sans interruption jusqu'à la veille, plus aujourd'hui. Un jour manqué remet la série à 1.
 */
export function streakFor(today: string, rewardedDays: Iterable<string>): StreakResult {
  const days = new Set(rewardedDays);
  let run = 0;
  for (let d = previousDay(today); days.has(d); d = previousDay(d)) run++;
  const streak = run + 1;
  return {
    streak,
    position: ((streak - 1) % STREAK_LENGTH_DAYS) + 1,
    completesStreak: streak % STREAK_LENGTH_DAYS === 0,
  };
}
