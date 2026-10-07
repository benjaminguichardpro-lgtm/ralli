// Contrôle du vocabulaire affiché à l'utilisateur (cadre légal du brief).
// Appliqué sur le texte rendu des pages (tests E2E), pas sur le code source.
// Mots entiers, insensible à la casse, avec exceptions explicites pour les faux positifs.

type Rule = { word: string; pattern: RegExp };

// \p{L} : on borne sur les lettres Unicode pour que « mise » ne matche pas « remise » ni « misère ».
const B = "(?<![\\p{L}\\p{N}])";
const E = "(?![\\p{L}\\p{N}])";

const ALLOWED_AFTER_MISE = ["à\\s+jour", "en\\s+place", "en\\s+forme", "en\\s+avant", "en\\s+page", "en\\s+ligne", "en\\s+œuvre"];

const RULES: Rule[] = [
  // « pari », « paris », « parier », « parieur »… Le nom propre « Paris » (majuscule seule) est toléré.
  { word: "pari", pattern: new RegExp(`${B}(pari|paris|parier|pariez|parions|parié|pariée|pariés|parieur|parieurs|parieuse|parieuses)${E}`, "giu") },
  // « mise », « mises », « miser »… sauf expressions courantes listées (« mise en jeu » reste interdit).
  { word: "mise", pattern: new RegExp(`${B}(mise|mises|miser|misez|misé|misée|misés)${E}(?!\\s+(?:${ALLOWED_AFTER_MISE.join("|")})${E})`, "giu") },
  { word: "bookmaker", pattern: new RegExp(`${B}bookmakers?${E}`, "giu") },
  // Aucune mention monétaire : les Aces n'ont pas de valeur.
  { word: "euro", pattern: new RegExp(`${B}euros?${E}|€`, "giu") },
];

export type ForbiddenHit = { word: string; match: string; index: number };

export function findForbiddenWords(text: string): ForbiddenHit[] {
  const hits: ForbiddenHit[] = [];
  for (const rule of RULES) {
    for (const m of text.matchAll(rule.pattern)) {
      // Nom propre : seule la forme exacte « Paris » est tolérée (« paris », « PARIS » restent interdits).
      if (rule.word === "pari" && m[0] === "Paris") continue;
      hits.push({ word: rule.word, match: m[0], index: m.index ?? 0 });
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}
