// Modèle de cotes : fonctions pures, sans accès base ni horloge.
// L'historique (forme, confrontations) est fourni par l'appelant (voir ./history.ts).

import type { FftRank } from "@/generated/prisma/enums";
import { ODDS_CONFIG, type OddsConfig } from "@/config/odds";
import { fftIndex } from "@/lib/fft";

export type MatchResult = "W" | "L";

export type OddsInput = {
  rankA: FftRank;
  rankB: FftRank;
  /** Résultats récents de A, du plus récent au plus ancien (seuls les `formWindow` premiers comptent). */
  formA: readonly MatchResult[];
  formB: readonly MatchResult[];
  /** Confrontations directes confirmées entre A et B. */
  h2h: { winsA: number; winsB: number };
};

export type OddsResult = {
  /** Probabilité que A gagne, avant bornage. */
  rawProbabilityA: number;
  /** Probabilités bornées, avec probabilityA + probabilityB = 1. */
  probabilityA: number;
  probabilityB: number;
  /** Cotes en centièmes entiers (156 = 1,56). */
  oddsX100A: number;
  oddsX100B: number;
  /** Détail du calcul, enregistré avec la cote pour le backtest. */
  breakdown: {
    ratingA: number;
    ratingB: number;
    formAdjA: number;
    formAdjB: number;
    h2hAdj: number;
    diff: number;
  };
  configVersion: string;
};

export function ratingOf(rank: FftRank, cfg: OddsConfig = ODDS_CONFIG): number {
  const i = fftIndex(rank);
  if (i < 0) throw new RangeError(`Niveau FFT inconnu : ${rank}`);
  return i * cfg.ratingStep;
}

/** (victoires − défaites) sur les `formWindow` derniers matchs × constante. Sans historique : 0. */
export function formAdjustment(results: readonly MatchResult[], cfg: OddsConfig = ODDS_CONFIG): number {
  let net = 0;
  for (const r of results.slice(0, cfg.formWindow)) net += r === "W" ? 1 : -1;
  return net * cfg.formPointsPerNetWin;
}

/** (victoires A − victoires B) × constante, si au moins une confrontation ; sinon 0. */
export function h2hAdjustment(h2h: { winsA: number; winsB: number }, cfg: OddsConfig = ODDS_CONFIG): number {
  if (!Number.isInteger(h2h.winsA) || !Number.isInteger(h2h.winsB) || h2h.winsA < 0 || h2h.winsB < 0) {
    throw new RangeError("Confrontations directes invalides");
  }
  if (h2h.winsA + h2h.winsB === 0) return 0;
  return (h2h.winsA - h2h.winsB) * cfg.h2hPointsPerNetWin;
}

/** P(A bat B) pour un écart de rating d (formule Elo). */
export function eloProbability(diff: number, cfg: OddsConfig = ODDS_CONFIG): number {
  return 1 / (1 + 10 ** (-diff / cfg.eloDivisor));
}

/** Cote en centièmes : round(100 / p), arrondi au plus proche. */
export function oddsX100FromProbability(p: number): number {
  if (!(p > 0 && p <= 1)) throw new RangeError(`Probabilité invalide : ${p}`);
  return Math.round(100 / p);
}

export function computeOdds(input: OddsInput, cfg: OddsConfig = ODDS_CONFIG): OddsResult {
  if (Math.abs(cfg.probabilityMin + cfg.probabilityMax - 1) > 1e-9) {
    throw new Error("Bornes de probabilité non symétriques : P(B) = 1 − P(A) ne tiendrait plus");
  }
  const ratingA = ratingOf(input.rankA, cfg);
  const ratingB = ratingOf(input.rankB, cfg);
  const formAdjA = formAdjustment(input.formA, cfg);
  const formAdjB = formAdjustment(input.formB, cfg);
  const h2hAdj = h2hAdjustment(input.h2h, cfg);

  // Un seul écart pour les deux joueurs (décision 18) : la symétrie est garantie par construction.
  const diff = ratingA + formAdjA - (ratingB + formAdjB) + h2hAdj;
  const rawProbabilityA = eloProbability(diff, cfg);
  const probabilityA = Math.min(cfg.probabilityMax, Math.max(cfg.probabilityMin, rawProbabilityA));
  const probabilityB = 1 - probabilityA;

  return {
    rawProbabilityA,
    probabilityA,
    probabilityB,
    oddsX100A: oddsX100FromProbability(probabilityA),
    oddsX100B: oddsX100FromProbability(probabilityB),
    breakdown: { ratingA, ratingB, formAdjA, formAdjB, h2hAdj, diff },
    configVersion: cfg.version,
  };
}

/** Affichage français d'une cote : 156 → « 1,56 ». */
export function formatOdds(oddsX100: number): string {
  return (oddsX100 / 100).toFixed(2).replace(".", ",");
}
