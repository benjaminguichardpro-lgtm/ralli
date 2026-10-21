// Affiche d'un tournoi : légende des tableaux, découpage en pages, regroupement par horaire, mots d'en-tête. Fonctions pures.

/** Légende des tableaux (fiche de l'affiche) : trois lignes toujours affichées. */
export const TABLE_LEGEND: { title: string; items: { code: string; meaning: string }[] }[] = [
  {
    title: "Dames",
    items: [
      { code: "SD", meaning: "Simples Dames" },
      { code: "CSSD", meaning: "Consolante dames" },
      { code: "FTNCSD", meaning: "Fin de tableau non classé dames" },
      { code: "FT4SD", meaning: "Fin de tableau 4ème série dames" },
      { code: "FT3SD", meaning: "Fin de tableau 3ème série dames" },
    ],
  },
  {
    title: "Messieurs",
    items: [
      { code: "SM", meaning: "Simples Messieurs" },
      { code: "CSSM", meaning: "Consolante Messieurs" },
      { code: "FTNCSM", meaning: "Fin de tableau non classé messieurs" },
      { code: "FT4SM", meaning: "Fin de tableau 4ème série messieurs" },
      { code: "FT3SM", meaning: "Fin de tableau 3ème série messieurs" },
    ],
  },
  {
    title: "Fauteuil",
    items: [
      { code: "TFSM", meaning: "Tennis fauteuil simples messieurs" },
      { code: "TFDoubles", meaning: "Tennis fauteuil doubles" },
    ],
  },
];

export const TABLE_CODES: string[] = TABLE_LEGEND.flatMap((l) => l.items.map((i) => i.code));

/** Lignes par page sur l'écran du club-house (16:9). */
export const POSTER_ROWS_PER_PAGE = 14;

/** Découpe en pages d'au plus `perPage` lignes ; toujours au moins une page (même vide). */
export function paginate<T>(rows: readonly T[], perPage = POSTER_ROWS_PER_PAGE): T[][] {
  if (rows.length === 0) return [[]];
  const pages: T[][] = [];
  for (let i = 0; i < rows.length; i += perPage) pages.push(rows.slice(i, i + perPage));
  return pages;
}

/** « Matchs du » tant qu'un match n'a pas de score, « Résultats du » quand tous en ont un (et qu'il y en a). */
export function posterHeading(rows: readonly { done: boolean }[]): "Matchs du" | "Résultats du" {
  return rows.length > 0 && rows.every((r) => r.done) ? "Résultats du" : "Matchs du";
}

/** Vrai quand la ligne ouvre un nouveau créneau horaire (petit espace avant elle). */
export function startsNewSlot(rows: readonly { timeKey: string }[], index: number): boolean {
  return index > 0 && rows[index]!.timeKey !== rows[index - 1]!.timeKey;
}

/** Score affiché sur l'affiche : « 6/4 7/5 », « WO », « 6/4 3/2 ab. » (abandon). Vide tant que le match n'est pas joué. */
export function posterScore(r: { outcome: "COMPLETED" | "RETIRED" | "WALKOVER" | "NOT_PLAYED" | null; sets: string }): string {
  if (!r.outcome || r.outcome === "NOT_PLAYED") return "";
  if (r.outcome === "WALKOVER") return "WO";
  const sets = r.sets.replaceAll("-", "/");
  if (r.outcome === "RETIRED") return sets ? `${sets} ab.` : "ab.";
  return sets;
}
