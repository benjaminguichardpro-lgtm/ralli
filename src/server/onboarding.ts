import { db } from "@/lib/db";
import { sideName } from "@/lib/matches";
import { shareState } from "@/lib/win-cards";
import { sideLabel } from "./encounters";
import { DomainError } from "./errors";

/** Guide du premier lancement : vu ou passé. Idempotent (la première date est conservée). */
export async function markOnboardingSeen(userId: string, now = new Date()): Promise<void> {
  await db.user.updateMany({ where: { id: userId, onboardingSeenAt: null }, data: { onboardingSeenAt: now } });
}

export type RecapItem = {
  id: string;
  matchLabel: string;
  pickedName: string;
  committedAces: number;
  status: "WON" | "LOST" | "REFUNDED";
  payoutAces: number;
  /** Vrai si la victoire peut être partagée avec le club (bouton « Partager ma victoire »). */
  canShare: boolean;
};

export type ResultsRecap = {
  /** Date du plus récent pronostic montré (ISO) : renvoyée au serveur à la fermeture, pour ne rien perdre entre-temps. */
  cutoff: string;
  /** Aces gagnés : somme des gains des pronostics justes. */
  wonAces: number;
  won: number;
  lost: number;
  refunded: number;
  encounters: { encounterId: string; title: string; items: RecapItem[] }[];
};

type Person = { firstName: string; lastName: string };
const side = (a: Person, b: Person | null) => sideName(b ? [a, b] : [a]);

/**
 * Pronostics réglés (gagnés, perdus, remboursés) depuis la dernière fois que le récapitulatif a été vu.
 * Null s'il n'y en a aucun. Le guide du premier lancement passe avant : tant qu'il n'est pas vu, rien n'est calculé ici.
 */
export async function getUnseenResults(userId: string): Promise<ResultsRecap | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { resultsSeenAt: true } });
  if (!user) return null;
  const rows = await db.prediction.findMany({
    where: {
      userId,
      status: { in: ["WON", "LOST", "REFUNDED"] },
      settledAt: user.resultsSeenAt ? { gt: user.resultsSeenAt } : { not: null },
    },
    orderBy: [{ settledAt: "asc" }, { id: "asc" }],
    take: 200,
    select: {
      id: true,
      pickedSide: true,
      committedAces: true,
      status: true,
      payoutAces: true,
      settledAt: true,
      stories: { where: { deletedAt: null, kind: "WIN_CARD" }, select: { id: true }, take: 1 },
      match: {
        select: {
          order: true,
          encounterId: true,
          homePlayer: { select: { firstName: true, lastName: true } },
          awayPlayer: { select: { firstName: true, lastName: true } },
          homePlayer2: { select: { firstName: true, lastName: true } },
          awayPlayer2: { select: { firstName: true, lastName: true } },
          encounter: {
            select: {
              status: true,
              organizerClubId: true,
              homeTeam: { select: { name: true, kind: true, externalClubName: true, club: { select: { name: true } } } },
              awayTeam: { select: { name: true, kind: true, externalClubName: true, club: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });
  if (rows.length === 0) return null;
  const memberOf = new Set((await db.clubMembership.findMany({ where: { userId }, select: { clubId: true } })).map((m) => m.clubId));
  const now = new Date();

  const byEncounter = new Map<string, ResultsRecap["encounters"][number]>();
  let wonAces = 0;
  let won = 0;
  let lost = 0;
  let refunded = 0;
  for (const p of rows) {
    const status = p.status as RecapItem["status"];
    const gain = status === "WON" ? (p.payoutAces ?? 0) : 0;
    if (status === "WON") {
      won++;
      wonAces += gain;
    } else if (status === "LOST") lost++;
    else refunded++;
    const m = p.match;
    const e = byEncounter.get(m.encounterId) ?? {
      encounterId: m.encounterId,
      title: `${sideLabel(m.encounter.homeTeam)} – ${sideLabel(m.encounter.awayTeam)}`,
      items: [],
    };
    e.items.push({
      id: p.id,
      matchLabel: `${side(m.homePlayer, m.homePlayer2)} contre ${side(m.awayPlayer, m.awayPlayer2)}`,
      pickedName: p.pickedSide === "HOME" ? side(m.homePlayer, m.homePlayer2) : side(m.awayPlayer, m.awayPlayer2),
      committedAces: p.committedAces,
      status,
      payoutAces: status === "WON" ? gain : status === "REFUNDED" ? p.committedAces : 0,
      canShare:
        shareState({ status: p.status, settledAt: p.settledAt, encounterConfirmed: m.encounter.status === "CONFIRMED", alreadyShared: p.stories.length > 0, isMember: memberOf.has(m.encounter.organizerClubId) }, now) === "can",
    });
    byEncounter.set(m.encounterId, e);
  }
  const last = rows[rows.length - 1]!.settledAt!;
  return { cutoff: last.toISOString(), wonAces, won, lost, refunded, encounters: [...byEncounter.values()] };
}

/** Vrai s'il y a des rallis réglés depuis la dernière fermeture de la popup de résultats : pastille sur l'onglet « Mes rallis ». */
export async function hasUnseenResults(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { resultsSeenAt: true, onboardingSeenAt: true } });
  if (!user) return false;
  const n = await db.prediction.count({
    where: {
      userId,
      status: { in: ["WON", "LOST", "REFUNDED"] },
      settledAt: user.resultsSeenAt ? { gt: user.resultsSeenAt } : { not: null },
    },
  });
  return n > 0;
}

/**
 * Le récapitulatif a été vu jusqu'à `cutoff` (la date du dernier pronostic montré, pas « maintenant » :
 * un pronostic réglé pendant que la fenêtre était ouverte sera montré la fois suivante). Ne recule jamais.
 */
export async function markResultsSeen(userId: string, cutoff: Date, now = new Date()): Promise<void> {
  if (Number.isNaN(cutoff.getTime()) || cutoff.getTime() > now.getTime() + 60_000) throw new DomainError("INVALID", "Date invalide");
  await db.user.updateMany({
    where: { id: userId, OR: [{ resultsSeenAt: null }, { resultsSeenAt: { lt: cutoff } }] },
    data: { resultsSeenAt: cutoff },
  });
}
