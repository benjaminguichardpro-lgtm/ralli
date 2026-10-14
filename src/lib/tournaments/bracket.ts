// Tableau à élimination directe : arithmétique du tableau et noms des tours. Fonctions pures.
// Les matchs d'un tableau de N joueurs : N/2 au premier tour, puis N/4… jusqu'à la finale (N − 1 matchs au total).

export const DRAW_SIZES = [4, 8, 16, 32] as const;
export type DrawSize = (typeof DRAW_SIZES)[number];

export const isDrawSize = (n: number): n is DrawSize => (DRAW_SIZES as readonly number[]).includes(n);

/** Nombre de tours : 4 → 2, 8 → 3, 16 → 4, 32 → 5. */
export const roundCount = (drawSize: number): number => Math.log2(drawSize);

/** Nombre de matchs dans un tour (1 = premier tour). */
export const matchesInRound = (drawSize: number, round: number): number => drawSize / 2 ** round;

/** Nom d'un tour, du point de vue de la finale : « Finale », « Demi-finales », « Quarts de finale », « Huitièmes de finale », « Seizièmes de finale ». */
export function roundName(drawSize: number, round: number): string {
  const fromEnd = roundCount(drawSize) - round; // 0 = finale
  return ["Finale", "Demi-finales", "Quarts de finale", "Huitièmes de finale", "Seizièmes de finale"][fromEnd] ?? `Tour ${round}`;
}

/** Même nom au singulier, pour désigner un match : « Finale », « Demi-finale », « Quart de finale »… */
export function matchRoundName(drawSize: number, round: number): string {
  const fromEnd = roundCount(drawSize) - round;
  return ["Finale", "Demi-finale", "Quart de finale", "Huitième de finale", "Seizième de finale"][fromEnd] ?? `Tour ${round}`;
}

/** Où va le vainqueur : le match du tour suivant et le côté qu'il y occupe (les positions paires à domicile, les impaires à l'extérieur). Null pour la finale. */
export function nextSlot(drawSize: number, round: number, position: number): { round: number; position: number; side: "HOME" | "AWAY" } | null {
  if (round >= roundCount(drawSize)) return null;
  return { round: round + 1, position: position >> 1, side: position % 2 === 0 ? "HOME" : "AWAY" };
}

/** Vrai si c'est la finale. */
export const isFinal = (drawSize: number, round: number): boolean => round === roundCount(drawSize);
