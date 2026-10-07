// ⚠ CONSTANTES NON CALIBRÉES ⚠
// Valeurs de départ fixées par le brief. Aucune n'est validée tant qu'un backtest n'a pas été fait
// sur des résultats réels. Toute modification doit changer `version` : la version est enregistrée
// avec chaque cote figée (Match.oddsInputs), pour pouvoir comparer les modèles a posteriori.

export type OddsConfig = {
  /** Identifiant enregistré avec chaque cote figée. */
  version: string;
  /** false tant qu'aucun backtest n'a validé ces valeurs. */
  calibrated: boolean;
  /** Écart de rating entre deux échelons FFT consécutifs. */
  ratingStep: number;
  /** Diviseur de la formule Elo : P(A) = 1 / (1 + 10^(−d / eloDivisor)). */
  eloDivisor: number;
  /** Nombre de derniers matchs confirmés pris en compte pour la forme. */
  formWindow: number;
  /** Points de rating par (victoire − défaite) sur la fenêtre de forme. */
  formPointsPerNetWin: number;
  /** Points de rating par (victoires A − victoires B) en confrontation directe. */
  h2hPointsPerNetWin: number;
  /** Bornes de probabilité, symétriques : min + max = 1, donc P(B) = 1 − P(A) reste vrai après bornage. */
  probabilityMin: number;
  probabilityMax: number;
};

export const ODDS_CONFIG: OddsConfig = {
  version: "v1-non-calibre-2026-10-07",
  calibrated: false,
  ratingStep: 100, // NON CALIBRÉ
  eloDivisor: 400, // formule du brief
  formWindow: 5, // NON CALIBRÉ
  formPointsPerNetWin: 10, // NON CALIBRÉ
  h2hPointsPerNetWin: 15, // NON CALIBRÉ
  probabilityMin: 0.12, // NON CALIBRÉ → cote max 8,33
  probabilityMax: 0.88, // NON CALIBRÉ → cote min 1,14
};
