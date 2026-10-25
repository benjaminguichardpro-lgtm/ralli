// Libellés et décompte des matchs d'une rencontre (simples et doubles). Fonctions pures.

import type { MatchKind, Side } from "@/generated/prisma/enums";
import { publicPlayerName, visitorPlayerName } from "./names";

export const MATCH_POINTS = [1, 2] as const;

/** Mot employé dans les libellés : « simple » ou « double ». */
export const kindWord = (kind: MatchKind) => (kind === "DOUBLES" ? "double" : "simple");
export const kindTitle = (kind: MatchKind) => (kind === "DOUBLES" ? "Double" : "Simple");

/** Numéro de chaque match dans son type (Simple 1, Simple 2, Double 1…), dans l'ordre reçu. */
export function numberByKind<T extends { kind: MatchKind }>(matches: readonly T[]): (T & { number: number })[] {
  const seen: Record<MatchKind, number> = { SINGLES: 0, DOUBLES: 0 };
  return matches.map((m) => ({ ...m, number: ++seen[m.kind] }));
}

/** Les simples d'abord, puis les doubles ; à type égal, l'ordre de création (stable). */
export function sortSinglesFirst<T extends { kind: MatchKind; order: number }>(matches: readonly T[]): T[] {
  return [...matches].sort((a, b) => Number(a.kind === "DOUBLES") - Number(b.kind === "DOUBLES") || a.order - b.order);
}

type Person = { firstName: string; lastName: string };

/** « Léa Martin » pour un simple, « Léa Martin / Hugo Durand » pour une paire ; `visitor` : « Léa M. » (personne sans compte). */
export function sideName(players: readonly Person[], visitor = false): string {
  const name = visitor ? visitorPlayerName : publicPlayerName;
  return players.map((p) => name(p.firstName, p.lastName)).join(" / ");
}

/** Points de chaque côté : un match gagné rapporte ses points ; un match sans vainqueur n'en rapporte à personne. */
export function tallyPoints(matches: readonly { winnerSide: Side | null; points: number }[]): { home: number; away: number } {
  let home = 0;
  let away = 0;
  for (const m of matches) {
    if (m.winnerSide === "HOME") home += m.points;
    else if (m.winnerSide === "AWAY") away += m.points;
  }
  return { home, away };
}

export const pointsLabel = (n: number) => `${n} point${n > 1 ? "s" : ""}`;
