import { LEADERBOARD_SIZE, MIN_SETTLED_SEASON, MIN_SETTLED_WEEK, SEASON_END, SEASON_START } from "@/config/season";
import { db } from "@/lib/db";
import { type PlayerTotals, type RankMove, type RankedRow, rankMove, rankPlayers, selectDisplay, weekLeaders } from "@/lib/leaderboard/rank";
import { parisWeekBounds } from "@/lib/time";
import { requireClubMember } from "./permissions";

export type Period = "season" | "week";

export type LeaderboardView = {
  period: Period;
  minSettled: number;
  /** Fenêtre de dates de règlement prise en compte. */
  from: Date;
  to: Date;
  top: RankedRow[];
  /** Ligne du lecteur s'il est classé au-delà de l'affichage. */
  me: RankedRow | null;
  /** Nombre total de joueurs classés. */
  total: number;
  /** Pronostics terminés du lecteur sur la période (pour lui dire ce qu'il lui manque). */
  mySettled: number;
  /** Ligne du lecteur s'il est classé sur la période (qu'il soit dans l'affichage ou non). */
  myRow: RankedRow | null;
  /** Mouvement de place du lecteur depuis lundi 00 h : seulement sur le classement de la saison, s'il y est classé. */
  myMove: RankMove | null;
  /** Leader(s) de la semaine (bénéfice positif), null s'il n'y en a pas. */
  weekLeaders: { names: string[]; net: number } | null;
};

/** Fenêtre de règlement de la période, toujours bornée par la saison. */
export function periodWindow(period: Period, now: Date): { from: Date; to: Date } {
  if (period === "season") return { from: SEASON_START, to: SEASON_END };
  const w = parisWeekBounds(now);
  return {
    from: new Date(Math.max(w.start.getTime(), SEASON_START.getTime())),
    to: new Date(Math.min(w.end.getTime(), SEASON_END.getTime())),
  };
}

/**
 * Totaux par joueur pour un club et une fenêtre de dates de règlement.
 * Seuls comptent les pronostics gagnés ou perdus des rencontres CONFIRMED et réglées du club organisateur (décisions C1, C2, C8) :
 * ni remboursés, ni en attente, ni bonus.
 */
export async function clubTotals(clubId: string, from: Date, to: Date): Promise<PlayerTotals[]> {
  const groups = await db.prediction.groupBy({
    by: ["userId", "status"],
    where: {
      status: { in: ["WON", "LOST"] },
      match: { encounter: { organizerClubId: clubId, status: "CONFIRMED", settledAt: { gte: from, lt: to } } },
    },
    _sum: { committedAces: true, payoutAces: true },
    _count: { _all: true },
  });
  const byUser = new Map<string, { net: number; settled: number; wins: number }>();
  for (const g of groups) {
    const t = byUser.get(g.userId) ?? { net: 0, settled: 0, wins: 0 };
    t.net += (g._sum.payoutAces ?? 0) - (g._sum.committedAces ?? 0);
    t.settled += g._count._all;
    if (g.status === "WON") t.wins += g._count._all;
    byUser.set(g.userId, t);
  }
  const users = await db.user.findMany({ where: { id: { in: [...byUser.keys()] } }, select: { id: true, displayName: true, avatarKey: true, avatarPhotoAt: true } });
  const byId = new Map(users.map((u) => [u.id, u]));
  return [...byUser].map(([userId, t]) => {
    const u = byId.get(userId);
    return { userId, displayName: u?.displayName ?? "?", avatarKey: u?.avatarKey, avatarPhotoAt: u?.avatarPhotoAt ?? null, ...t };
  });
}

/** Classement d'un club, réservé à ses membres (décisions C1, C10). */
export async function getLeaderboard(
  viewerId: string,
  clubId: string,
  period: Period,
  opts: { limit?: number; now?: Date } = {},
): Promise<LeaderboardView> {
  await requireClubMember(viewerId, clubId);
  const { from, to } = periodWindow(period, opts.now ?? new Date());
  const minSettled = period === "season" ? MIN_SETTLED_SEASON : MIN_SETTLED_WEEK;
  const now = opts.now ?? new Date();
  const week = periodWindow("week", now);
  const [totals, weekTotals, lastMonday] = await Promise.all([
    clubTotals(clubId, from, to),
    period === "week" ? Promise.resolve(null) : clubTotals(clubId, week.from, week.to),
    // Classement de la saison tel qu'il était lundi 00 h (heure de Paris) : sert au mouvement de place.
    period === "season" ? clubTotals(clubId, SEASON_START, week.from) : Promise.resolve(null),
  ]);
  const ranked = rankPlayers(totals, minSettled);
  const { top, me } = selectDisplay(ranked, viewerId, opts.limit ?? LEADERBOARD_SIZE);
  const myRow = ranked.find((r) => r.userId === viewerId) ?? null;
  let myMove: RankMove | null = null;
  if (myRow && lastMonday) {
    const before = rankPlayers(lastMonday, minSettled).find((r) => r.userId === viewerId)?.rank ?? null;
    myMove = rankMove(before, myRow.rank);
  }
  const weekRanked = period === "week" ? ranked : rankPlayers(weekTotals ?? [], MIN_SETTLED_WEEK);
  return {
    period,
    minSettled,
    from,
    to,
    top,
    me,
    total: ranked.length,
    mySettled: totals.find((t) => t.userId === viewerId)?.settled ?? 0,
    myRow,
    myMove,
    weekLeaders: weekLeaders(weekRanked),
  };
}
