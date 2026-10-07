// Affiche les cotes produites par le modèle (constantes NON CALIBRÉES) sur des cas types.
// Usage : npm run odds:table
import { ODDS_CONFIG } from "../src/config/odds";
import { fftLabel } from "../src/lib/fft";
import { type OddsInput, computeOdds, formatOdds } from "../src/lib/odds/model";

const pct = (p: number) => `${(p * 100).toFixed(1).replace(".", ",")} %`;
const row = (label: string, input: OddsInput) => {
  const r = computeOdds(input);
  const bounded = r.rawProbabilityA !== r.probabilityA ? " (borné)" : "";
  console.log(
    `${label.padEnd(46)} P(A) ${pct(r.probabilityA).padStart(7)}${bounded.padEnd(9)} cote A ${formatOdds(r.oddsX100A).padStart(5)}   cote B ${formatOdds(r.oddsX100B).padStart(5)}`,
  );
};
const none = { formA: [], formB: [], h2h: { winsA: 0, winsB: 0 } } as const;

console.log(`Modèle ${ODDS_CONFIG.version} — calibré : ${ODDS_CONFIG.calibrated ? "oui" : "NON"}`);
console.log(
  `pas ${ODDS_CONFIG.ratingStep} · forme ${ODDS_CONFIG.formPointsPerNetWin}/match sur ${ODDS_CONFIG.formWindow} · H2H ${ODDS_CONFIG.h2hPointsPerNetWin} · P ∈ [${ODDS_CONFIG.probabilityMin} ; ${ODDS_CONFIG.probabilityMax}]\n`,
);

console.log("Écart de classement (A mieux classé), sans historique :");
const ladder = ["R30_5", "R30_4", "R30_3", "R30_2", "R30_1", "R30"] as const;
for (let gap = 0; gap < ladder.length; gap++) {
  row(`  ${fftLabel(ladder[gap]!)} contre ${fftLabel(ladder[0])} (${gap} échelon${gap > 1 ? "s" : ""})`, { rankA: ladder[gap]!, rankB: ladder[0], ...none });
}

console.log("\nEffet de la forme et des confrontations, à classement égal (30 contre 30) :");
row("  A : 3 victoires sur 5, B : 2 sur 5", { rankA: "R30", rankB: "R30", formA: ["W", "W", "W", "L", "L"], formB: ["W", "W", "L", "L", "L"], h2h: { winsA: 0, winsB: 0 } });
row("  A : 5/5, B : 0/5", { rankA: "R30", rankB: "R30", formA: ["W", "W", "W", "W", "W"], formB: ["L", "L", "L", "L", "L"], h2h: { winsA: 0, winsB: 0 } });
row("  A a battu B 2 fois sur 2", { ...none, rankA: "R30", rankB: "R30", h2h: { winsA: 2, winsB: 0 } });

console.log("\nCas mixtes :");
row("  15/2 contre 15/1, A en forme (5/5), B 1/5", { rankA: "R15_2", rankB: "R15_1", formA: ["W", "W", "W", "W", "W"], formB: ["W", "L", "L", "L", "L"], h2h: { winsA: 0, winsB: 0 } });
row("  NC contre 1re série", { rankA: "NC", rankB: "PREMIERE_SERIE", ...none });
