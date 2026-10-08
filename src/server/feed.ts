import type { Side } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { type EffectiveStatus, STATUS_LABELS, effectiveStatus } from "@/lib/encounters/state";
import { fftLabel } from "@/lib/fft";
import { publicPlayerName } from "@/lib/names";
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
  /** Motif d'anti-trucage pour ce lecteur, null s'il peut pronostiquer. */
  blockedReason: string | null;
  matches: FeedMatch[];
};

export type HomeFeed = { balance: number; encounters: FeedEncounter[]; hasClub: boolean };

const teamSelect = { name: true, kind: true, externalClubName: true, captainId: true, club: { select: { name: true } } } as const;
const playerSelect = { firstName: true, lastName: true, fftRank: true } as const;

/**
 * Fil de l'accueil : rencontres publiées et non terminées des clubs de l'utilisateur, la plus proche d'abord,
 * avec leurs simples, leurs cotes et le pronostic éventuel de l'utilisateur.
 */
export async function getHomeFeed(userId: string, now = new Date()): Promise<HomeFeed> {
  const [balance, memberships, rows] = await Promise.all([
    balanceIn(db, userId),
    db.clubMembership.count({ where: { userId } }),
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
        homeTeam: { select: teamSelect },
        awayTeam: { select: teamSelect },
        matches: {
          where: { voidedAt: null },
          orderBy: { order: "asc" },
          select: {
            id: true,
            oddsHomeX100: true,
            oddsAwayX100: true,
            homePlayer: { select: playerSelect },
            awayPlayer: { select: playerSelect },
            predictions: {
              where: { userId },
              select: { pickedSide: true, committedAces: true, oddsX100: true, status: true, payoutAces: true },
            },
          },
        },
      },
    }),
  ]);

  const pick = (p: { firstName: string; lastName: string; fftRank: Parameters<typeof fftLabel>[0] }, x100: number | null): PickView => ({
    name: publicPlayerName(p.firstName, p.lastName),
    rank: fftLabel(p.fftRank),
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
        blockedReason,
        matches: e.matches.map((m, i) => {
          const mine = m.predictions[0];
          return {
            id: m.id,
            number: i + 1,
            home: pick(m.homePlayer, m.oddsHomeX100),
            away: pick(m.awayPlayer, m.oddsAwayX100),
            mine: mine
              ? { side: mine.pickedSide as Side, committedAces: mine.committedAces, odds: formatOdds(mine.oddsX100), status: mine.status, payoutAces: mine.payoutAces }
              : null,
          };
        }),
      };
    }),
  );

  return { balance, encounters, hasClub: memberships > 0 };
}
