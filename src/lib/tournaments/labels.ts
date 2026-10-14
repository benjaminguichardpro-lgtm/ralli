import { matchRoundName } from "./bracket";

/** Titre d'un match de tournoi dans les listes de pronostics (Mes rallis, récapitulatif, portefeuille) : « Tournoi d'automne · Demi-finale ». */
export const tournamentMatchTitle = (t: { name: string; drawSize: number }, round: number): string => `${t.name} · ${matchRoundName(t.drawSize, round)}`;
