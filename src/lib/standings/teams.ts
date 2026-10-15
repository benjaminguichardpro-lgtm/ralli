import { parseParisLocal } from "@/lib/time";

// Classement des équipes d'un club : victoire 3 points, nul 1, défaite 0 ; départage par la différence de points de match,
// puis le nombre de victoires, puis l'ordre alphabétique. Fonctions pures.

export const WIN_POINTS = 3;
export const DRAW_POINTS = 1;

export type TeamGame = { teamId: string; scored: number; conceded: number };
export type StandingRow = { teamId: string; name: string; rank: number; played: number; won: number; drawn: number; lost: number; diff: number; points: number };

/** Année de début de la saison (1er septembre → 31 août, heure de Paris) qui contient cet instant. */
export function seasonYearOf(date: Date): number {
  const year = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", year: "numeric" }).format(date));
  return date.getTime() >= parseParisLocal(`${year}-09-01T00:00`).getTime() ? year : year - 1;
}

export function seasonRange(year: number): { from: Date; to: Date } {
  return { from: parseParisLocal(`${year}-09-01T00:00`), to: parseParisLocal(`${year + 1}-09-01T00:00`) };
}

export const seasonLabel = (year: number) => `${year}-${year + 1}`;

/** Saison demandée dans l'adresse (« 2026 ») ; toute autre valeur donne la saison en cours. */
export function parseSeason(value: string | undefined, current: number): number {
  const n = Number(value);
  return /^\d{4}$/.test(value ?? "") && n >= 2000 && n <= current ? n : current;
}

export function computeStandings(teams: readonly { id: string; name: string }[], games: readonly TeamGame[]): StandingRow[] {
  const rows = teams.map((t) => ({ teamId: t.id, name: t.name, rank: 0, played: 0, won: 0, drawn: 0, lost: 0, diff: 0, points: 0 }));
  const byId = new Map(rows.map((r) => [r.teamId, r]));
  for (const g of games) {
    const r = byId.get(g.teamId);
    if (!r) continue;
    r.played += 1;
    r.diff += g.scored - g.conceded;
    if (g.scored > g.conceded) {
      r.won += 1;
      r.points += WIN_POINTS;
    } else if (g.scored < g.conceded) r.lost += 1;
    else {
      r.drawn += 1;
      r.points += DRAW_POINTS;
    }
  }
  rows.sort((a, b) => b.points - a.points || b.diff - a.diff || b.won - a.won || a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    r.rank = prev && prev.points === r.points && prev.diff === r.diff && prev.won === r.won ? prev.rank : i + 1;
  });
  return rows;
}
