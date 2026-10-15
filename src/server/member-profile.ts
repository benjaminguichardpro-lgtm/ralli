import { MIN_SETTLED_SEASON, SEASON_END, SEASON_START } from "@/config/season";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { fftLabel } from "@/lib/fft";
import { rankPlayers, successRate } from "@/lib/leaderboard/rank";
import { sideName } from "@/lib/matches";
import { formatOdds } from "@/lib/odds/model";
import { type ResultStatus, currentStreak } from "@/lib/predictions/results";
import { tournamentMatchTitle } from "@/lib/tournaments/labels";
import { sideLabel } from "./encounters";
import { clubTotals } from "./leaderboard";

// Profil d'un membre vu par un autre membre (tranche 39). Visible seulement entre membres d'au moins un club en commun ; tout
// est limité à ces clubs en commun. Jamais : email, solde, localisation, date de naissance, pronostics en cours.

export const PROFILE_RECENT = 10;

export type MemberResult = {
  id: string;
  title: string;
  matchLabel: string;
  pickedName: string;
  committedAces: number;
  odds: string;
  status: ResultStatus;
  payoutAces: number | null;
  settledAt: Date;
};

export type MemberProfile = {
  user: { id: string; displayName: string; avatarKey: string; avatarPhotoAt: Date | null; createdAt: Date };
  commonClubs: { id: string; name: string }[];
  /** Profil masqué par la personne : avatar, pseudo et clubs en commun seulement. */
  hidden: boolean;
  licences: { clubName: string; rankLabel: string; teams: string[] }[];
  stats: { settled: number; won: number; hitRate: number | null; netAces: number; committedAces: number; wonAces: number; streak: number };
  ranks: { clubId: string; clubName: string; rank: number | null; ofTotal: number }[];
  results: MemberResult[];
  hasMore: boolean;
};

type Person = { firstName: string; lastName: string };
const side = (a: Person, b: Person | null) => sideName(b ? [a, b] : [a]);

/** `null` : personne inconnue ou aucun club en commun (même réponse dans les deux cas). Soi-même : voir « Mon profil ». */
export async function getMemberProfile(viewerId: string, targetId: string, limit = PROFILE_RECENT): Promise<MemberProfile | null> {
  const [mine, theirs] = await Promise.all([
    db.clubMembership.findMany({ where: { userId: viewerId, club: { deletedAt: null } }, select: { clubId: true } }),
    db.clubMembership.findMany({
      where: { userId: targetId, club: { deletedAt: null } },
      select: { club: { select: { id: true, name: true } } },
      orderBy: { club: { name: "asc" } },
    }),
  ]);
  const mineIds = new Set(mine.map((m) => m.clubId));
  const commonClubs = theirs.map((t) => t.club).filter((c) => mineIds.has(c.id));
  if (commonClubs.length === 0) return null;
  const user = await db.user.findUnique({ where: { id: targetId }, select: { id: true, displayName: true, avatarKey: true, avatarPhotoAt: true, createdAt: true, profilePublic: true } });
  if (!user) return null;
  const empty = { settled: 0, won: 0, hitRate: null, netAces: 0, committedAces: 0, wonAces: 0, streak: 0 };
  const base = { user: { id: user.id, displayName: user.displayName, avatarKey: user.avatarKey, avatarPhotoAt: user.avatarPhotoAt, createdAt: user.createdAt }, commonClubs };
  if (!user.profilePublic) return { ...base, hidden: true, licences: [], stats: empty, ranks: [], results: [], hasMore: false };

  const ids = commonClubs.map((c) => c.id);
  const inCommon: Prisma.PredictionWhereInput = { OR: [{ match: { encounter: { organizerClubId: { in: ids } } } }, { tournamentMatch: { tournament: { clubId: { in: ids } } } }] };
  const [players, totals, rankings, recent, rows] = await Promise.all([
    db.player.findMany({
      where: { userId: targetId, clubId: { in: ids } },
      select: { fftRank: true, club: { select: { name: true } }, teams: { select: { team: { select: { name: true, kind: true } } } } },
    }),
    db.prediction.groupBy({ by: ["status"], where: { userId: targetId, status: { in: ["WON", "LOST"] }, AND: [inCommon] }, _count: { _all: true }, _sum: { committedAces: true, payoutAces: true } }),
    Promise.all(commonClubs.map(async (c) => ({ club: c, ranked: rankPlayers(await clubTotals(c.id, SEASON_START, SEASON_END), MIN_SETTLED_SEASON) }))),
    db.prediction.findMany({ where: { userId: targetId, status: { in: ["WON", "LOST"] }, settledAt: { not: null }, AND: [inCommon] }, orderBy: [{ settledAt: "desc" }, { id: "desc" }], take: 50, select: { status: true } }),
    // Seulement des pronostics réglés (gagnés, perdus, remboursés) : jamais un pronostic en cours.
    db.prediction.findMany({
      where: { userId: targetId, status: { in: ["WON", "LOST", "REFUNDED"] }, settledAt: { not: null }, AND: [inCommon] },
      orderBy: [{ settledAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      select: {
        id: true,
        pickedSide: true,
        committedAces: true,
        oddsX100: true,
        status: true,
        payoutAces: true,
        settledAt: true,
        tournamentMatch: {
          select: {
            round: true,
            homePlayer: { select: { firstName: true, lastName: true } },
            awayPlayer: { select: { firstName: true, lastName: true } },
            tournament: { select: { name: true, drawSize: true } },
          },
        },
        match: {
          select: {
            homePlayer: { select: { firstName: true, lastName: true } },
            awayPlayer: { select: { firstName: true, lastName: true } },
            homePlayer2: { select: { firstName: true, lastName: true } },
            awayPlayer2: { select: { firstName: true, lastName: true } },
            encounter: {
              select: {
                homeTeam: { select: { name: true, kind: true, externalClubName: true, club: { select: { name: true } } } },
                awayTeam: { select: { name: true, kind: true, externalClubName: true, club: { select: { name: true } } } },
              },
            },
          },
        },
      },
    }),
  ]);

  const pick = (s: "WON" | "LOST") => totals.find((t) => t.status === s);
  const won = pick("WON")?._count._all ?? 0;
  const settled = won + (pick("LOST")?._count._all ?? 0);
  const committedAces = (pick("WON")?._sum.committedAces ?? 0) + (pick("LOST")?._sum.committedAces ?? 0);
  const wonAces = pick("WON")?._sum.payoutAces ?? 0;

  const results: MemberResult[] = rows.slice(0, limit).map((p) => {
    const tm = p.tournamentMatch;
    const common = { id: p.id, committedAces: p.committedAces, odds: formatOdds(p.oddsX100), status: p.status as ResultStatus, payoutAces: p.payoutAces, settledAt: p.settledAt! };
    if (tm) {
      return {
        ...common,
        title: tm.tournament.name,
        matchLabel: `${tournamentMatchTitle(tm.tournament, tm.round)} : ${sideName([tm.homePlayer!])} contre ${sideName([tm.awayPlayer!])}`,
        pickedName: sideName([p.pickedSide === "HOME" ? tm.homePlayer! : tm.awayPlayer!]),
      };
    }
    const m = p.match!;
    return {
      ...common,
      title: `${sideLabel(m.encounter.homeTeam)} – ${sideLabel(m.encounter.awayTeam)}`,
      matchLabel: `${side(m.homePlayer, m.homePlayer2)} contre ${side(m.awayPlayer, m.awayPlayer2)}`,
      pickedName: p.pickedSide === "HOME" ? side(m.homePlayer, m.homePlayer2) : side(m.awayPlayer, m.awayPlayer2),
    };
  });

  return {
    ...base,
    hidden: false,
    licences: players.map((p) => ({ clubName: p.club.name, rankLabel: fftLabel(p.fftRank), teams: p.teams.filter((t) => t.team.kind === "CLUB").map((t) => t.team.name) })),
    stats: { settled, won, hitRate: settled === 0 ? null : successRate(won, settled), netAces: wonAces - committedAces, committedAces, wonAces, streak: currentStreak(recent as { status: ResultStatus }[]) },
    ranks: rankings.map(({ club, ranked }) => ({ clubId: club.id, clubName: club.name, rank: ranked.find((r) => r.userId === targetId)?.rank ?? null, ofTotal: ranked.length })),
    results,
    hasMore: rows.length > limit,
  };
}

export async function setProfilePublic(userId: string, visible: boolean): Promise<void> {
  await db.user.update({ where: { id: userId }, data: { profilePublic: visible } });
}

export async function getProfilePublic(userId: string): Promise<boolean> {
  return (await db.user.findUnique({ where: { id: userId }, select: { profilePublic: true } }))?.profilePublic ?? true;
}
