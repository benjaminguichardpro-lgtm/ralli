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

/** Mouvement de place depuis lundi 00 h : monté, descendu, inchangé, ou pas encore classé lundi (« Nouveau »). */
export type RankMove = { kind: "up" | "down" | "same"; places: number } | { kind: "new" };

/** `before` : place au classement de lundi 00 h (null si le joueur n'était pas encore classé) ; `now` : place actuelle. */
export function rankMove(before: number | null, now: number): RankMove {
  if (before === null) return { kind: "new" };
  if (now < before) return { kind: "up", places: before - now };
  if (now > before) return { kind: "down", places: now - before };
  return { kind: "same", places: 0 };
}

/** Texte court : « ▲2 », « ▼1 », « = », « Nouveau ». */
export function rankMoveShort(m: RankMove): string {
  switch (m.kind) {
    case "up":
      return `▲${m.places}`;
    case "down":
      return `▼${m.places}`;
    case "same":
      return "=";
    case "new":
      return "Nouveau";
  }
}

/** Phrase complète, pour les lecteurs d'écran : « 2 places gagnées depuis lundi ». */
export function rankMoveSentence(m: RankMove): string {
  switch (m.kind) {
    case "up":
      return `${m.places} place${m.places > 1 ? "s" : ""} gagnée${m.places > 1 ? "s" : ""} depuis lundi`;
    case "down":
      return `${m.places} place${m.places > 1 ? "s" : ""} perdue${m.places > 1 ? "s" : ""} depuis lundi`;
    case "same":
      return "Même place que lundi";
    case "new":
      return "Nouveau dans le classement depuis lundi";
  }
}

/** « 1er », « 2e », « 3e »… */
export function rankLabel(rank: number): string {
  return rank === 1 ? "1er" : `${rank}e`;
}

/** Leader(s) de la semaine : les joueurs au premier rang, seulement s'ils ont un bénéfice positif (sinon personne ne « mène »). */
export function weekLeaders(ranked: RankedRow[]): { names: string[]; net: number } | null {
  const first = ranked.filter((r) => r.rank === 1);
  if (first.length === 0 || first[0]!.net <= 0) return null;
  return { names: first.map((r) => r.displayName), net: first[0]!.net };
}
