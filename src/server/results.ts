import { db } from "@/lib/db";
import { sideName } from "@/lib/matches";
import { formatOdds } from "@/lib/odds/model";
import {
  PAGE_SIZE,
  type ResultFilterKey,
  RESULT_FILTERS,
  type ResultStatus,
  type ResultsSummary,
  type StatusTotals,
  currentStreak,
  filterCounts,
  groupByEncounter,
  summarize,
} from "@/lib/predictions/results";
import { tournamentMatchTitle } from "@/lib/tournaments/labels";
import { type ShareState, shareState } from "@/lib/win-cards";
import { sideLabel } from "./encounters";
import type { WinCardData } from "./win-cards";

export type ResultItem = {
  id: string;
  encounterId: string;
  matchLabel: string;
  pickedName: string;
  committedAces: number;
  odds: string;
  status: ResultStatus;
  payoutAces: number | null;
  settledAt: Date;
  /** Partage de la victoire : « can » = bouton « Partager ma victoire », « shared » = déjà partagé, « closed » = délai passé, « no » = pas gagné. */
  share: ShareState;
  /** Club à qui la victoire est montrée, et les chiffres de la carte (seulement si on peut la partager). */
  shareClubName: string;
  card: WinCardData | null;
};

/** `title` nomme déjà le club (« TC Lyon · Messieurs 1 – TC Voisin 1 ») : il suffit à distinguer les clubs d'un utilisateur qui en a plusieurs. */
export type ResultGroup = { encounterId: string; title: string; startsAt: Date; items: ResultItem[] };

export type ResultsView = {
  summary: ResultsSummary;
  /** Rallis justes d'affilée en ce moment (remboursés ignorés), quel que soit le filtre affiché. */
  streak: number;
  counts: Record<ResultFilterKey, number>;
  groups: ResultGroup[];
  /** Nombre de rallis affichés (tous groupes confondus). */
  shown: number;
  hasMore: boolean;
};

type Person = { firstName: string; lastName: string };
const side = (a: Person, b: Person | null) => sideName(b ? [a, b] : [a]);

/**
 * Rallis terminés (gagnés, perdus, remboursés) de l'utilisateur seul, tous clubs confondus, du plus récent au plus ancien.
 * Le résumé et les compteurs portent sur l'ensemble ; la liste est limitée à `limit` rallis (« Voir plus » pour en afficher davantage).
 */
export async function getResults(userId: string, filter: ResultFilterKey = "tous", limit = PAGE_SIZE, now = new Date()): Promise<ResultsView> {
  const status = RESULT_FILTERS.find((f) => f.key === filter)!.status;
  const [totalsRows, rows, recent, memberships] = await Promise.all([
    db.prediction.groupBy({
      by: ["status"],
      where: { userId, status: { in: ["WON", "LOST", "REFUNDED"] } },
      _count: { _all: true },
      _sum: { committedAces: true, payoutAces: true },
    }),
    db.prediction.findMany({
      where: { userId, status: status ? status : { in: ["WON", "LOST", "REFUNDED"] }, settledAt: { not: null } },
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
        stories: { where: { deletedAt: null, kind: "WIN_CARD" }, select: { id: true }, take: 1 },
        tournamentMatch: {
          select: {
            round: true,
            homePlayer: { select: { firstName: true, lastName: true } },
            awayPlayer: { select: { firstName: true, lastName: true } },
            tournament: { select: { id: true, name: true, drawSize: true, startsAt: true } },
          },
        },
        match: {
          select: {
            encounterId: true,
            homePlayer: { select: { firstName: true, lastName: true } },
            awayPlayer: { select: { firstName: true, lastName: true } },
            homePlayer2: { select: { firstName: true, lastName: true } },
            awayPlayer2: { select: { firstName: true, lastName: true } },
            encounter: {
              select: {
                startsAt: true,
                status: true,
                organizerClubId: true,
                organizerClub: { select: { name: true } },
                homeTeam: { select: { name: true, kind: true, externalClubName: true, club: { select: { name: true } } } },
                awayTeam: { select: { name: true, kind: true, externalClubName: true, club: { select: { name: true } } } },
              },
            },
          },
        },
      },
    }),
    // Les derniers rallis terminés, tous résultats confondus : sert à la série en cours (50 suffisent pour l'affichage).
    db.prediction.findMany({
      where: { userId, status: { in: ["WON", "LOST", "REFUNDED"] }, settledAt: { not: null } },
      orderBy: [{ settledAt: "desc" }, { id: "desc" }],
      take: 50,
      select: { status: true },
    }),
    db.clubMembership.findMany({ where: { userId }, select: { clubId: true } }),
  ]);
  const memberOf = new Set(memberships.map((m) => m.clubId));

  const pick = (s: "WON" | "LOST" | "REFUNDED") => totalsRows.find((r) => r.status === s);
  const totals: StatusTotals = {
    won: { count: pick("WON")?._count._all ?? 0, committed: pick("WON")?._sum.committedAces ?? 0, payout: pick("WON")?._sum.payoutAces ?? 0 },
    lost: { count: pick("LOST")?._count._all ?? 0, committed: pick("LOST")?._sum.committedAces ?? 0 },
    refunded: { count: pick("REFUNDED")?._count._all ?? 0 },
  };

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const meta = new Map<string, Omit<ResultGroup, "items">>();
  const items: ResultItem[] = page.map((p) => {
    const tm = p.tournamentMatch;
    if (tm) {
      // Pronostic de tournoi : la page est celle du tournoi (l'identifiant « encounterId » sert de lien, /rencontres/<id> y redirige) ; pas de carte à partager.
      const t = tm.tournament;
      meta.set(t.id, { encounterId: t.id, title: t.name, startsAt: t.startsAt });
      const matchLabel = `${sideName([tm.homePlayer!])} contre ${sideName([tm.awayPlayer!])}`;
      return {
        id: p.id,
        encounterId: t.id,
        matchLabel: `${tournamentMatchTitle(t, tm.round)} : ${matchLabel}`,
        pickedName: sideName([p.pickedSide === "HOME" ? tm.homePlayer! : tm.awayPlayer!]),
        committedAces: p.committedAces,
        odds: formatOdds(p.oddsX100),
        status: p.status as ResultStatus,
        payoutAces: p.payoutAces,
        settledAt: p.settledAt!,
        share: "no" as ShareState,
        shareClubName: "",
        card: null,
      };
    }
    const m = p.match!;
    meta.set(m.encounterId, {
      encounterId: m.encounterId,
      title: `${sideLabel(m.encounter.homeTeam)} – ${sideLabel(m.encounter.awayTeam)}`,
      startsAt: m.encounter.startsAt,
    });
    const matchLabel = `${side(m.homePlayer, m.homePlayer2)} contre ${side(m.awayPlayer, m.awayPlayer2)}`;
    const pickedName = p.pickedSide === "HOME" ? side(m.homePlayer, m.homePlayer2) : side(m.awayPlayer, m.awayPlayer2);
    const odds = formatOdds(p.oddsX100);
    const share = shareState(
      { status: p.status, settledAt: p.settledAt, encounterConfirmed: m.encounter.status === "CONFIRMED", alreadyShared: p.stories.length > 0, isMember: memberOf.has(m.encounter.organizerClubId) },
      now,
    );
    return {
      id: p.id,
      encounterId: m.encounterId,
      matchLabel,
      pickedName,
      committedAces: p.committedAces,
      odds,
      status: p.status as ResultStatus,
      payoutAces: p.payoutAces,
      settledAt: p.settledAt!,
      share,
      shareClubName: m.encounter.organizerClub.name,
      card:
        share === "can"
          ? { predictionId: p.id, encounterId: m.encounterId, encounterTitle: `${sideLabel(m.encounter.homeTeam)} – ${sideLabel(m.encounter.awayTeam)}`, matchLabel, pickedName, committedAces: p.committedAces, odds, payoutAces: p.payoutAces ?? 0 }
          : null,
    };
  });

  return {
    summary: summarize(totals),
    streak: currentStreak(recent as { status: ResultStatus }[]),
    counts: filterCounts(totals),
    groups: groupByEncounter(items).map((g) => ({ ...meta.get(g.encounterId)!, items: g.items })),
    shown: items.length,
    hasMore,
  };
}
