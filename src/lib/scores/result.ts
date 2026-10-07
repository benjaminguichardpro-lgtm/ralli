// Résultat d'un match saisi par le club : lecture des sets et contrôle de cohérence (décision S5, contrôle léger).
// Fonctions pures. Les sets ne servent pas au règlement : seuls l'issue et le vainqueur comptent.

import type { MatchOutcome, Side } from "@/generated/prisma/enums";

export type SetScore = { home: number; away: number; superTiebreak?: true };
export type MatchResult = { outcome: MatchOutcome; winnerSide: Side | null; sets: SetScore[] };

export class ScoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScoreError";
  }
}

export const OUTCOME_LABELS: Record<MatchOutcome, string> = {
  COMPLETED: "Joué jusqu'au bout",
  RETIRED: "Abandon",
  WALKOVER: "WO",
  NOT_PLAYED: "Non joué",
};

const SETS_EXAMPLE = "exemple : 6-4 3-6 10-8";

/** « 6-4 3-6 10-8 » → sets. Le troisième set est un super tie-break s'il atteint 10 points. Vide → aucun set. */
export function parseSets(text: string): SetScore[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const tokens = trimmed.split(/[\s,;]+/);
  if (tokens.length > 3) throw new ScoreError(`Trois sets au maximum (${SETS_EXAMPLE})`);
  return tokens.map((t, i) => {
    const m = /^(\d{1,2})-(\d{1,2})$/.exec(t);
    if (!m) throw new ScoreError(`Set illisible : « ${t} » (${SETS_EXAMPLE})`);
    const home = Number(m[1]);
    const away = Number(m[2]);
    return i === 2 && Math.max(home, away) >= 10 ? { home, away, superTiebreak: true } : { home, away };
  });
}

export function formatSets(sets: SetScore[]): string {
  return sets.map((s) => `${s.home}-${s.away}`).join(" ");
}

function checkSet(s: SetScore, index: number) {
  const hi = Math.max(s.home, s.away);
  const lo = Math.min(s.home, s.away);
  const label = `${s.home}-${s.away}`;
  if (s.superTiebreak) {
    if (index !== 2) throw new ScoreError("Le super tie-break ne peut être que le troisième set");
    if (hi < 10 || hi - lo < 2 || hi > 30) throw new ScoreError(`Super tie-break improbable : ${label} (10 points, 2 d'écart)`);
    return;
  }
  if (hi > 7 || hi < 4 || s.home === s.away) throw new ScoreError(`Score de set improbable : ${label}`);
}

/**
 * Contrôle un résultat et renvoie sa forme normalisée.
 * - non joué : ni vainqueur ni sets ;
 * - autres issues : vainqueur obligatoire ;
 * - joué jusqu'au bout avec sets : 2 ou 3 sets, scores plausibles, vainqueur = celui qui gagne 2 sets ;
 * - abandon et WO : sets libres.
 */
export function validateResult(r: MatchResult): MatchResult {
  if (r.outcome === "NOT_PLAYED") {
    if (r.winnerSide !== null || r.sets.length > 0) throw new ScoreError("Un match non joué n'a ni vainqueur ni score");
    return { outcome: "NOT_PLAYED", winnerSide: null, sets: [] };
  }
  if (r.winnerSide === null) throw new ScoreError("Indiquez le vainqueur");
  if (r.outcome === "COMPLETED" && r.sets.length > 0) {
    if (r.sets.length < 2) throw new ScoreError("Un match joué compte 2 ou 3 sets");
    r.sets.forEach(checkSet);
    const home = r.sets.filter((s) => s.home > s.away).length;
    const away = r.sets.filter((s) => s.away > s.home).length;
    if (Math.max(home, away) !== 2 || home === away) throw new ScoreError("Les sets ne donnent pas de vainqueur (il faut gagner 2 sets)");
    if ((home > away ? "HOME" : "AWAY") !== r.winnerSide) throw new ScoreError("Le vainqueur ne correspond pas aux sets saisis");
  }
  return { outcome: r.outcome, winnerSide: r.winnerSide, sets: r.sets };
}
