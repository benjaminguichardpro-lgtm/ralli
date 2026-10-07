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
  { fg: "ink", bg: "canvas", min: 4.5, usage: "Texte principal sur fond crème" },
  { fg: "ink", bg: "surface", min: 4.5, usage: "Texte principal sur carte" },
  { fg: "ink-muted", bg: "canvas", min: 4.5, usage: "Texte secondaire sur fond crème" },
  { fg: "ink-muted", bg: "surface", min: 4.5, usage: "Texte secondaire sur carte" },
  { fg: "primary", bg: "canvas", min: 4.5, usage: "Titres verts sur fond crème" },
  { fg: "primary", bg: "surface", min: 4.5, usage: "Titres verts sur carte" },
  { fg: "on-primary", bg: "primary", min: 4.5, usage: "Bouton primaire" },
  { fg: "on-accent", bg: "accent", min: 4.5, usage: "Badge de cote / CTA secondaire" },
  { fg: "accent", bg: "surface", min: 4.5, usage: "Texte terre battue sur carte" },
  { fg: "on-success", bg: "success", min: 4.5, usage: "Badge « gagné »" },
  { fg: "success-ink", bg: "surface", min: 4.5, usage: "Texte « gagné » sur carte" },
  { fg: "success-ink", bg: "canvas", min: 4.5, usage: "Texte « gagné » sur fond crème" },
];

/** Combinaisons interdites, listées pour mémoire avec leur ratio réel. */
export const FORBIDDEN_PAIRS: Omit<ContrastPair, "min">[] = [
  { fg: "accent", bg: "canvas", usage: "Texte terre battue sur crème" },
  { fg: "on-primary", bg: "success", usage: "Texte blanc sur vert gazon" },
  { fg: "success", bg: "surface", usage: "Texte vert gazon sur carte" },
];
