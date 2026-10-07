// Extraction pure de la forme et des confrontations directes à partir de matchs confirmés.
// Le chargement en base (rencontres CONFIRMED antérieures à l'ouverture) viendra avec les rencontres.

import type { MatchOutcome, Side } from "@/generated/prisma/enums";
import type { MatchResult } from "./model";

export type HistoricalMatch = {
  homePlayerId: string;
  awayPlayerId: string;
  outcome: MatchOutcome;
  winnerSide: Side | null;
  /** Date de début de la rencontre. */
  playedAt: Date;
  /** Ordre du match dans la rencontre (départage deux matchs du même jour). */
  order: number;
};

/** Matchs pris en compte : joués jusqu'au bout et abandons. WO et non joués sont ignorés. */
export function countsForHistory(m: HistoricalMatch): boolean {
  return (m.outcome === "COMPLETED" || m.outcome === "RETIRED") && m.winnerSide !== null;
}

function winnerId(m: HistoricalMatch): string {
  return m.winnerSide === "HOME" ? m.homePlayerId : m.awayPlayerId;
}

function involves(m: HistoricalMatch, playerId: string): boolean {
  return m.homePlayerId === playerId || m.awayPlayerId === playerId;
}

/** Plus récent d'abord. */
function byRecency(a: HistoricalMatch, b: HistoricalMatch): number {
  return b.playedAt.getTime() - a.playedAt.getTime() || b.order - a.order;
}

/** Résultats du joueur, du plus récent au plus ancien, limités à `window`. */
export function recentForm(playerId: string, matches: readonly HistoricalMatch[], window: number): MatchResult[] {
  return matches
    .filter((m) => countsForHistory(m) && involves(m, playerId))
    .sort(byRecency)
    .slice(0, window)
    .map((m) => (winnerId(m) === playerId ? "W" : "L"));
}

export function headToHead(
  playerA: string,
  playerB: string,
  matches: readonly HistoricalMatch[],
): { winsA: number; winsB: number } {
  let winsA = 0;
  let winsB = 0;
  for (const m of matches) {
    if (!countsForHistory(m) || !involves(m, playerA) || !involves(m, playerB)) continue;
    if (winnerId(m) === playerA) winsA++;
    else winsB++;
  }
  return { winsA, winsB };
}
