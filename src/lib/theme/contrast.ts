// Calcul de contraste WCAG 2.x, utilisé par le script `npm run contrast` et par les tests.

export function parseHex(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Couleur hex invalide : ${hex}`);
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function channel(c8: number): number {
  const c = c8 / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Extrait les tokens `--color-xxx: #hex` du bloc @theme de globals.css. */
export function parseThemeColors(css: string): Record<string, string> {
  const colors: Record<string, string> = {};
  for (const m of css.matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    colors[m[1]!] = m[2]!.toLowerCase();
  }
  return colors;
}

export type ContrastPair = {
  fg: string;
  bg: string;
  /** 4.5 = texte normal (AA), 3 = grand texte ou composant d'interface (AA). */
  min: 4.5 | 3;
  usage: string;
};

/** Combinaisons autorisées dans l'UI. Toute nouvelle combinaison doit être ajoutée ici. */
export const ALLOWED_PAIRS: ContrastPair[] = [
  { fg: "ink", bg: "canvas", min: 4.5, usage: "Texte principal sur fond de page" },
  { fg: "ink", bg: "surface", min: 4.5, usage: "Texte principal sur carte" },
  { fg: "ink", bg: "pale", min: 4.5, usage: "Texte principal sur vert pâle (encadrés, étiquettes)" },
  { fg: "ink-muted", bg: "canvas", min: 4.5, usage: "Texte secondaire sur fond de page" },
  { fg: "ink-muted", bg: "surface", min: 4.5, usage: "Texte secondaire sur carte" },
  { fg: "ink-muted", bg: "pale", min: 4.5, usage: "Texte secondaire sur vert pâle" },
  { fg: "danger", bg: "surface", min: 4.5, usage: "Croix rouge d'archivage sur carte" },
  { fg: "danger", bg: "canvas", min: 4.5, usage: "Rouge d'alerte sur fond de page" },
  { fg: "on-danger", bg: "danger", min: 4.5, usage: "Texte blanc sur rouge" },
  { fg: "primary", bg: "canvas", min: 4.5, usage: "Titres et liens verts sur fond de page" },
  { fg: "primary", bg: "surface", min: 4.5, usage: "Titres, liens et contours de cotes sur carte" },
  { fg: "primary", bg: "pale", min: 4.5, usage: "Texte vert sur vert pâle" },
  { fg: "on-primary", bg: "primary", min: 4.5, usage: "Bouton primaire, cote sélectionnée" },
  { fg: "on-primary", bg: "brand", min: 4.5, usage: "En-tête vert Ralli" },
  { fg: "on-primary", bg: "primary-dark", min: 4.5, usage: "Texte blanc sur vert nuit (prochaine rencontre, panneau)" },
  { fg: "on-primary-soft", bg: "brand", min: 4.5, usage: "Texte secondaire sur l'en-tête" },
  { fg: "on-primary-soft", bg: "primary", min: 4.5, usage: "Texte secondaire sur vert action" },
  { fg: "on-primary-soft", bg: "primary-dark", min: 4.5, usage: "Texte secondaire sur vert nuit" },
  { fg: "gold", bg: "primary-dark", min: 4.5, usage: "Cote ou gain en or sur vert nuit" },
  { fg: "gold", bg: "primary", min: 4.5, usage: "Cote sélectionnée en or sur vert action" },
  { fg: "gold", bg: "brand", min: 4.5, usage: "Or sur vert Ralli" },
  { fg: "on-gold", bg: "gold", min: 4.5, usage: "Bouton « Valider mon ralli » et montant choisi" },
  { fg: "primary-dark", bg: "gold", min: 4.5, usage: "Texte vert nuit sur or" },
  { fg: "on-accent", bg: "accent", min: 4.5, usage: "CTA secondaire (or sur fond clair)" },
  { fg: "accent", bg: "surface", min: 4.5, usage: "Heures et séries en or sur carte" },
  { fg: "on-clay", bg: "clay", min: 4.5, usage: "Nom et cote du joueur pendant le remplissage terre battue" },
  { fg: "on-success", bg: "success", min: 4.5, usage: "Badge « Pronostics ouverts » et « gagné »" },
  { fg: "success-ink", bg: "surface", min: 4.5, usage: "Texte « gagné » sur carte" },
  { fg: "success-ink", bg: "canvas", min: 4.5, usage: "Texte « gagné » sur fond de page" },
];

/** Combinaisons interdites, listées pour mémoire avec leur ratio réel. */
export const FORBIDDEN_PAIRS: Omit<ContrastPair, "min">[] = [
  { fg: "accent", bg: "canvas", usage: "Texte or sur fond de page (ratio 4,2) : réservé aux cartes blanches" },
  { fg: "accent", bg: "pale", usage: "Texte or sur vert pâle" },
  { fg: "success-ink", bg: "pale", usage: "Texte « gagné » sur vert pâle (ratio 4,4)" },
  { fg: "gold", bg: "surface", usage: "Or clair sur blanc (ratio 1,6) : réservé aux fonds verts foncés" },
  { fg: "gold", bg: "canvas", usage: "Or clair sur fond de page" },
];
