import type { Side } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { type EncounterResult, clubResult } from "@/lib/encounters/filters";
import { tallyPoints } from "@/lib/matches";
import { sideLabel } from "./encounters";

// Résultats des rencontres des clubs de l'utilisateur, pour l'accueil (les 5 derniers) et la page « Résultats » (tous, filtrables
// par club et par équipe). Un score proposé mais pas encore confirmé est affiché « provisoire ». Jamais d'archive, de brouillon,
// de rencontre annulée ni de score contesté (aucun score à montrer).

export type ResultItem = {
  id: string;
  startsAt: Date;
  home: string;
  away: string;
  /** Points de chaque camp, dans l'ordre d'affichage (domicile – extérieur). */
  homePoints: number;
  awayPoints: number;
  /** Résultat vu du club de l'utilisateur. */
  result: EncounterResult;
  club: { id: string; name: string; logoUpdatedAt: Date | null };
};

export type ResultsOptions = { clubs: { id: string; name: string; teams: { id: string; name: string }[] }[] };

export const RESULTS_PAGE_SIZE = 20;
export const HOME_RESULTS = 5;

const teamSelect = { name: true, kind: true, externalClubName: true, club: { select: { name: true } } } as const;

/** Clubs de l'utilisateur et leurs équipes (pour les puces de filtre). */
export async function getResultsOptions(userId: string): Promise<ResultsOptions> {
  const memberships = await db.clubMembership.findMany({
    where: { userId },
    orderBy: { club: { name: "asc" } },
    select: { club: { select: { id: true, name: true, teams: { where: { kind: "CLUB" }, orderBy: { name: "asc" }, select: { id: true, name: true } } } } },
  });
  return { clubs: memberships.map((m) => m.club) };
}

/**
 * Derniers résultats, du plus récent au plus ancien. `clubId` et `teamId` restreignent (un club dont l'utilisateur n'est pas
 * membre ne donne rien). `limit` rencontres au plus ; `hasMore` dit s'il en reste.
 */
export async function listResults(userId: string, opts: { clubId?: string | null; teamId?: string | null; limit?: number } = {}): Promise<{ items: ResultItem[]; hasMore: boolean }> {
  const limit = opts.limit ?? RESULTS_PAGE_SIZE;
  const rows = await db.encounter.findMany({
    where: {
      organizerClub: { memberships: { some: { userId } } },
      ...(opts.clubId ? { organizerClubId: opts.clubId } : {}),
      ...(opts.teamId ? { OR: [{ homeTeamId: opts.teamId }, { awayTeamId: opts.teamId }] } : {}),
      archivedAt: null,
      status: { in: ["CONFIRMED", "SCORE_PROPOSED"] },
    },
    orderBy: [{ startsAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: {
      id: true,
      status: true,
      startsAt: true,
      organizerClub: { select: { id: true, name: true, logoUpdatedAt: true } },
      homeTeam: { select: teamSelect },
      awayTeam: { select: teamSelect },
      matches: { where: { voidedAt: null }, select: { winnerSide: true, points: true } },
    },
  });
  const items = rows.slice(0, limit).map((r) => {
    const tally = tallyPoints(r.matches as { winnerSide: Side | null; points: number }[]);
    return {
      id: r.id,
      startsAt: r.startsAt,
      home: sideLabel(r.homeTeam),
      away: sideLabel(r.awayTeam),
      homePoints: tally.home,
      awayPoints: tally.away,
      result: clubResult(tally, r.homeTeam.kind === "CLUB", r.status === "SCORE_PROPOSED"),
      club: r.organizerClub,
    };
  });
  return { items, hasMore: rows.length > limit };
}
