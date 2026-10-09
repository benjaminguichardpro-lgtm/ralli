// Classement : agrégation, tri, rangs et sélection de l'affichage. Fonctions pures.

export type PlayerTotals = {
  userId: string;
  displayName: string;
  /** Pour afficher l'avatar (absent dans les tests purs). */
  avatarKey?: string;
  avatarPhotoAt?: Date | null;
  /** Aces gagnés moins Aces engagés, sur les pronostics terminés gagnés ou perdus (décision C2). */
  net: number;
  /** Pronostics terminés (gagnés + perdus ; les remboursés ne comptent pas). */
  settled: number;
  wins: number;
};

export type RankedRow = PlayerTotals & { rank: number; successRate: number };

/** Taux de réussite en pourcentage entier, arrondi au plus proche. */
export function successRate(wins: number, settled: number): number {
  return settled === 0 ? 0 : Math.round((wins * 100) / settled);
}

/**
 * Filtre sur le seuil de participation, trie (bénéfice, puis pronostics gagnés, puis pseudo) et attribue les rangs.
 * Égalité de bénéfice = même rang (1, 2, 2, 4).
 */
export function rankPlayers(players: PlayerTotals[], minSettled: number): RankedRow[] {
  const eligible = players.filter((p) => p.settled >= minSettled);
  const sorted = [...eligible].sort(
    (a, b) => b.net - a.net || b.wins - a.wins || a.displayName.localeCompare(b.displayName, "fr", { sensitivity: "base" }) || a.userId.localeCompare(b.userId),
  );
  return sorted.map((p) => ({
    ...p,
    rank: 1 + sorted.filter((q) => q.net > p.net).length,
    successRate: successRate(p.wins, p.settled),
  }));
}

/** Les `limit` premiers, plus la ligne du lecteur s'il est classé plus bas (décision C9). */
export function selectDisplay(ranked: RankedRow[], viewerId: string, limit: number): { top: RankedRow[]; me: RankedRow | null } {
  const top = ranked.slice(0, limit);
  const me = ranked.find((r) => r.userId === viewerId) ?? null;
  return { top, me: me && !top.some((r) => r.userId === viewerId) ? me : null };
}
