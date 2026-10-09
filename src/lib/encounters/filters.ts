// Résultat d'une rencontre pour le club, et filtres de la liste des rencontres. Fonctions pures.

import type { EffectiveStatus } from "./state";

export type ResultKind = "WIN" | "LOSS" | "DRAW";

/** Résultat vu du club (l'équipe du club dans la rencontre) : ses points d'abord. */
export type EncounterResult = { kind: ResultKind; club: number; opp: number };

/**
 * Victoire, défaite ou nul pour le club, au total des points du score final (un match gagné rapporte 1 ou 2 points).
 * `clubIsHome` : l'équipe du club joue à domicile dans la rencontre.
 */
export function clubResult(tally: { home: number; away: number }, clubIsHome: boolean): EncounterResult {
  const club = clubIsHome ? tally.home : tally.away;
  const opp = clubIsHome ? tally.away : tally.home;
  return { kind: club > opp ? "WIN" : club < opp ? "LOSS" : "DRAW", club, opp };
}

export const RESULT_LABELS: Record<ResultKind, string> = { WIN: "Victoire", LOSS: "Défaite", DRAW: "Nul" };

export const resultBadgeText = (r: EncounterResult) => `${RESULT_LABELS[r.kind]} ${r.club} – ${r.opp}`;

type Filterable = { status: EffectiveStatus; result: EncounterResult | null };

export const FILTERS = [
  { key: "toutes", label: "Toutes", test: () => true },
  { key: "a-venir", label: "À venir", test: (e: Filterable) => e.status === "DRAFT" || e.status === "OPEN" },
  {
    key: "en-cours",
    label: "En cours",
    test: (e: Filterable) => e.status === "LOCKED" || e.status === "SCORE_PROPOSED" || e.status === "DISPUTED",
  },
  { key: "terminees", label: "Terminées", test: (e: Filterable) => e.status === "CONFIRMED" },
  { key: "victoires", label: "Victoires", test: (e: Filterable) => e.result?.kind === "WIN" },
  { key: "defaites", label: "Défaites", test: (e: Filterable) => e.result?.kind === "LOSS" },
  { key: "nuls", label: "Nuls", test: (e: Filterable) => e.result?.kind === "DRAW" },
  { key: "annulees", label: "Annulées", test: (e: Filterable) => e.status === "CANCELLED" },
] as const;

export type FilterKey = (typeof FILTERS)[number]["key"];

/** Valeur du paramètre d'adresse `?statut=` : toute valeur inconnue revient à « Toutes ». */
export function parseFilter(raw: string | string[] | undefined): FilterKey {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return FILTERS.find((f) => f.key === v)?.key ?? "toutes";
}

export function applyFilter<T extends Filterable>(items: readonly T[], key: FilterKey): T[] {
  const f = FILTERS.find((x) => x.key === key)!;
  return items.filter((e) => f.test(e));
}

/** Nombre de rencontres par filtre (affiché sur chaque puce). */
export function countFilters(items: readonly Filterable[]): Record<FilterKey, number> {
  return Object.fromEntries(FILTERS.map((f) => [f.key, items.filter((e) => f.test(e)).length])) as Record<FilterKey, number>;
}
