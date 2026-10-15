import type { Side } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { tallyPoints } from "@/lib/matches";
import { type StandingRow, type TeamGame, computeStandings, seasonRange, seasonYearOf } from "@/lib/standings/teams";

// Classement des équipes d'un club pour une saison. Seules les rencontres CONFIRMÉES comptent (ni score provisoire, ni en direct,
// ni contestée, ni annulée) ; les archivées comptent encore. L'appelant vérifie que le lecteur a le droit de voir ce club.

export type TeamStandings = { year: number; rows: StandingRow[]; years: number[] };

export async function getTeamStandings(clubId: string, year: number, now: Date): Promise<TeamStandings> {
  const { from, to } = seasonRange(year);
  const [teams, encounters, dates] = await Promise.all([
    db.team.findMany({ where: { clubId, kind: "CLUB" }, select: { id: true, name: true } }),
    db.encounter.findMany({
      where: { organizerClubId: clubId, status: "CONFIRMED", startsAt: { gte: from, lt: to } },
      select: { homeTeamId: true, awayTeamId: true, homeTeam: { select: { kind: true } }, awayTeam: { select: { kind: true } }, matches: { where: { voidedAt: null }, select: { winnerSide: true, points: true } } },
    }),
    db.encounter.findMany({ where: { organizerClubId: clubId, status: "CONFIRMED" }, select: { startsAt: true } }),
  ]);
  const games: TeamGame[] = [];
  for (const e of encounters) {
    const t = tallyPoints(e.matches as { winnerSide: Side | null; points: number }[]);
    if (e.homeTeam.kind === "CLUB") games.push({ teamId: e.homeTeamId, scored: t.home, conceded: t.away });
    if (e.awayTeam.kind === "CLUB") games.push({ teamId: e.awayTeamId, scored: t.away, conceded: t.home });
  }
  const years = [...new Set([seasonYearOf(now), ...dates.map((d) => seasonYearOf(d.startsAt))])].sort((a, b) => b - a);
  return { year, rows: computeStandings(teams, games), years };
}
