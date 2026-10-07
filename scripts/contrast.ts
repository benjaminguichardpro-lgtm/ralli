// Affiche les ratios de contraste des couleurs du thème (lues dans globals.css).
// Usage : npm run contrast
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ALLOWED_PAIRS, FORBIDDEN_PAIRS, contrastRatio, parseThemeColors } from "../src/lib/theme/contrast";

const colors = parseThemeColors(readFileSync(join(__dirname, "../src/app/globals.css"), "utf8"));

const row = (fg: string, bg: string, usage: string, min?: number) => {
  const r = contrastRatio(colors[fg]!, colors[bg]!);
  const verdict = r >= 4.5 ? "AA" : r >= 3 ? "AA grand texte seulement" : "ÉCHEC";
  const ok = min === undefined ? "" : r >= min ? "  ✓" : "  ✗";
  console.log(
    `${r.toFixed(2).padStart(6)}  ${verdict.padEnd(24)} ${`${fg} (${colors[fg]}) sur ${bg} (${colors[bg]})`.padEnd(48)} ${usage}${ok}`,
  );
};

console.log("Combinaisons autorisées :");
for (const p of ALLOWED_PAIRS) row(p.fg, p.bg, p.usage, p.min);
console.log("\nCombinaisons interdites (pour mémoire) :");
for (const p of FORBIDDEN_PAIRS) row(p.fg, p.bg, p.usage);
