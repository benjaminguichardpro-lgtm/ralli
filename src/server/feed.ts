import type { Side } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { type EffectiveStatus, STATUS_LABELS, effectiveStatus } from "@/lib/encounters/state";
import { fftLabel } from "@/lib/fft";
import { numberByKind, sideName, tallyPoints } from "@/lib/matches";
import { formatOdds } from "@/lib/odds/model";
import { type MyPrediction, balanceIn, exclusionReason } from "./predictions";
import { sideLabel } from "./encounters";

export type PickView = { name: string; rank: string; oddsX100: number | null; odds: string | null };

export type FeedMatch = {
  id: string;
  number: number;
  home: PickView;
  away: PickView;
  mine: MyPrediction | null;
};

export type FeedEncounter = {
  id: string;
  status: EffectiveStatus;
  statusLabel: string;
  startsAt: Date;
  predictionsCloseAt: Date;
  home: string;
  away: string;
  /** Club organisateur : son logo s'affiche sur la carte quand l'utilisateur a plusieurs clubs. */
  club: { id: string; name: string; logoUpdatedAt: Date | null };
  /** Score en direct (domicile, extérieur) d'une rencontre en cours dont au moins un match est saisi ; null sinon. */
  liveScore: { home: number; away: number } | null;
  /** Motif d'anti-trucage pour ce lecteur, null s'il peut pronostiquer. */
  blockedReason: string | null;
  matches: FeedMatch[];
};

/** `stewardClubs` : clubs où l'utilisateur peut créer une rencontre (admin du club ou capitaine d'une de ses équipes). */
export type HomeFeed = { balance: number; encounters: FeedEncounter[]; hasClub: boolean; multiClub: boolean; stewardClubs: { id: string; name: string }[] };

const teamSelect = { name: true, kind: true, externalClubName: true, captainId: true, club: { select: { name: true } } } as const;
const playerSelect = { firstName: true, lastName: true, fftRank: true } as const;

/**
 * Fil de l'accueil : rencontres publiées et non terminées des clubs de l'utilisateur, la plus proche d'abord,
 * avec leurs simples, leurs cotes et le pronostic éventuel de l'utilisateur.
 */
export async function getHomeFeed(userId: string, now = new Date()): Promise<HomeFeed> {
  const [balance, memberships, stewardClubs, rows] = await Promise.all([
    balanceIn(db, userId),
    db.clubMembership.count({ where: { userId } }),
    db.club.findMany({
      where: {
        OR: [
          { memberships: { some: { userId, role: "ADMIN" } } },
          { memberships: { some: { userId } }, teams: { some: { kind: "CLUB", captainId: userId } } },
        ],
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.encounter.findMany({
      where: { organizerClub: { memberships: { some: { userId } } }, status: { in: ["OPEN", "SCORE_PROPOSED", "DISPUTED"] } },
      orderBy: { startsAt: "asc" },
      take: 10,
      select: {
        id: true,
        status: true,
        startsAt: true,
        predictionsCloseAt: true,
        organizerClubId: true,
        organizerClub: { select: { id: true, name: true, logoUpdatedAt: true } },
        homeTeam: { select: teamSelect },
        awayTeam: { select: teamSelect },
        matches: {
          where: { voidedAt: null },
          orderBy: [{ kind: "asc" }, { order: "asc" }],
          select: {
            id: true,
            kind: true,
            points: true,
            winnerSide: true,
            oddsHomeX100: true,
            oddsAwayX100: true,
            homePlayer: { select: playerSelect },
            awayPlayer: { select: playerSelect },
            homePlayer2: { select: playerSelect },
            awayPlayer2: { select: playerSelect },
            predictions: {
              where: { userId },
              select: { pickedSide: true, committedAces: true, oddsX100: true, status: true, payoutAces: true },
            },
          },
        },
      },
    }),
  ]);

  type P = { firstName: string; lastName: string; fftRank: Parameters<typeof fftLabel>[0] };
  const pick = (players: P[], x100: number | null): PickView => ({
    name: sideName(players),
    rank: players.map((p) => fftLabel(p.fftRank)).join(" · "),
    oddsX100: x100,
    odds: x100 === null ? null : formatOdds(x100),
  });

  const encounters: FeedEncounter[] = await Promise.all(
    rows.map(async (e) => {
      const status = effectiveStatus(e, now);
      const blockedReason = status === "OPEN" ? await exclusionReason(db, userId, { id: e.id, organizerClubId: e.organizerClubId, homeTeam: e.homeTeam, awayTeam: e.awayTeam }) : null;
      return {
        id: e.id,
        status,
        statusLabel: STATUS_LABELS[status],
        startsAt: e.startsAt,
        predictionsCloseAt: e.predictionsCloseAt,
        home: sideLabel(e.homeTeam),
        away: sideLabel(e.awayTeam),
        club: e.organizerClub,
        blockedReason,
        liveScore: status === "LOCKED" && e.matches.some((m) => m.winnerSide !== null) ? tallyPoints(e.matches) : null,
        matches: numberByKind(e.matches).map((m) => {
          const mine = m.predictions[0];
          return {
            id: m.id,
            number: m.number,
            home: pick(m.homePlayer2 ? [m.homePlayer, m.homePlayer2] : [m.homePlayer], m.oddsHomeX100),
            away: pick(m.awayPlayer2 ? [m.awayPlayer, m.awayPlayer2] : [m.awayPlayer], m.oddsAwayX100),
            mine: mine
              ? { side: mine.pickedSide as Side, committedAces: mine.committedAces, odds: formatOdds(mine.oddsX100), status: mine.status, payoutAces: mine.payoutAces }
              : null,
          };
        }),
      };
    }),
  );

  return { balance, encounters, hasClub: memberships > 0, multiClub: memberships > 1, stewardClubs };
}
