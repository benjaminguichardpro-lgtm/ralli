import { parseParisLocal } from "@/lib/time";

// Saison unique du MVP (décision C4, à revoir après le pilote). Les dates sont lues en heure de Paris.
// Un pronostic compte au classement selon la date de règlement de sa rencontre, début inclus, fin exclue.
export const SEASON_START = parseParisLocal("2026-09-01T00:00");
export const SEASON_END = parseParisLocal("2027-09-01T00:00");

/** Pronostics terminés minimum pour apparaître (décision C6). */
export const MIN_SETTLED_SEASON = 3;
export const MIN_SETTLED_WEEK = 1;
/** Lignes affichées dans le classement complet. */
export const LEADERBOARD_SIZE = 20;
