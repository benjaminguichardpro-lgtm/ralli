import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { sideName } from "@/lib/matches";
import { formatOdds } from "@/lib/odds/model";
import { type ShareState, reportReasonSchema, shareState, winCommentSchema } from "@/lib/win-cards";
import { storyExpiry } from "@/lib/stories";
import { sideLabel } from "./encounters";
import { DomainError, isUniqueViolation } from "./errors";
import { CLUB_NOT_FOUND, requireClubAdmin, requireClubMember } from "./permissions";

// Rallis gagnants en story. Les droits sont relus en base à chaque appel. La carte n'est jamais copiée : ses chiffres sont
// lus en direct sur le pronostic réglé (qui ne change plus une fois gagné).

type Person = { firstName: string; lastName: string };
const side = (a: Person, b: Person | null) => sideName(b ? [a, b] : [a]);

const teamSelect = { name: true, kind: true, externalClubName: true, club: { select: { name: true } } } as const;
const playerSelect = { firstName: true, lastName: true } as const;

/** Ce qu'il faut lire sur un pronostic pour dessiner sa carte. */
export const predictionCardSelect = {
  id: true,
  pickedSide: true,
  committedAces: true,
  oddsX100: true,
  payoutAces: true,
  match: {
    select: {
      encounterId: true,
      homePlayer: { select: playerSelect },
      awayPlayer: { select: playerSelect },
      homePlayer2: { select: playerSelect },
      awayPlayer2: { select: playerSelect },
      encounter: { select: { homeTeam: { select: teamSelect }, awayTeam: { select: teamSelect } } },
    },
  },
} satisfies Prisma.PredictionSelect;

type CardRow = Prisma.PredictionGetPayload<{ select: typeof predictionCardSelect }>;

/** Les chiffres d'une carte de ralli gagnant (aucune date : tout passe tel quel au navigateur). */
export type WinCardData = {
  predictionId: string;
  encounterId: string;
  encounterTitle: string;
  matchLabel: string;
  pickedName: string;
  committedAces: number;
  odds: string;
  payoutAces: number;
};

export function toWinCardData(p: CardRow): WinCardData {
  const m = p.match;
  return {
    predictionId: p.id,
    encounterId: m.encounterId,
    encounterTitle: `${sideLabel(m.encounter.homeTeam)} – ${sideLabel(m.encounter.awayTeam)}`,
    matchLabel: `${side(m.homePlayer, m.homePlayer2)} contre ${side(m.awayPlayer, m.awayPlayer2)}`,
    pickedName: p.pickedSide === "HOME" ? side(m.homePlayer, m.homePlayer2) : side(m.awayPlayer, m.awayPlayer2),
    committedAces: p.committedAces,
    odds: formatOdds(p.oddsX100),
    payoutAces: p.payoutAces ?? 0,
  };
}

/** Un ralli de l'utilisateur, avec ce qu'il faut pour savoir s'il se partage et pour dessiner sa carte. */
export async function getWinShare(userId: string, predictionId: string, now = new Date()): Promise<{ state: ShareState; card: WinCardData; clubId: string; clubName: string }> {
  const p = await db.prediction.findUnique({
    where: { id: predictionId },
    select: {
      ...predictionCardSelect,
      userId: true,
      status: true,
      settledAt: true,
      match: { select: { ...predictionCardSelect.match.select, encounter: { select: { status: true, organizerClubId: true, organizerClub: { select: { name: true } }, homeTeam: { select: teamSelect }, awayTeam: { select: teamSelect } } } } },
      stories: { where: { deletedAt: null, kind: "WIN_CARD" }, select: { id: true }, take: 1 },
    },
  });
  if (!p || p.userId !== userId) throw new DomainError("NOT_FOUND", "Ralli introuvable");
  const clubId = p.match.encounter.organizerClubId;
  const member = await db.clubMembership.findUnique({ where: { userId_clubId: { userId, clubId } }, select: { userId: true } });
  const state = shareState({ status: p.status, settledAt: p.settledAt, encounterConfirmed: p.match.encounter.status === "CONFIRMED", alreadyShared: p.stories.length > 0, isMember: member !== null }, now);
  return { state, card: toWinCardData(p), clubId, clubName: p.match.encounter.organizerClub.name };
}

/**
 * Partage un ralli gagné au club : une carte automatique et un commentaire facultatif (140 caractères). Le membre doit être
 * l'auteur du ralli et membre du club organisateur ; une seule carte non supprimée par ralli ; 7 jours après le règlement.
 * Partager ne rapporte aucun Ace.
 */
export async function shareWin(actorId: string, predictionId: string, rawComment: string, now = new Date()): Promise<{ id: string; clubId: string }> {
  const comment = winCommentSchema.safeParse(rawComment);
  if (!comment.success) throw new DomainError("STORY_INVALID", comment.error.issues[0]?.message ?? "Commentaire invalide");
  const { state, clubId } = await getWinShare(actorId, predictionId, now);
  if (state === "no") throw new DomainError("FORBIDDEN", "Seul un ralli gagné peut être partagé");
  if (state === "shared") throw new DomainError("ALREADY_SHARED", "Ce ralli est déjà partagé avec le club");
  if (state === "closed") throw new DomainError("FORBIDDEN", "Ce ralli ne peut plus être partagé (7 jours après le résultat, dans ton club)");
  await requireClubMember(actorId, clubId);
  try {
    const story = await db.story.create({
      data: { clubId, authorId: actorId, kind: "WIN_CARD", body: comment.data, background: "brand", predictionId, createdAt: now, expiresAt: storyExpiry(now) },
      select: { id: true },
    });
    return { id: story.id, clubId };
  } catch (e) {
    if (isUniqueViolation(e)) throw new DomainError("ALREADY_SHARED", "Ce ralli est déjà partagé avec le club");
    throw e;
  }
}

/** Carte de ralli gagnant que `userId` peut réagir ou signaler : encore visible (24 h ou à la une), non supprimée, dans son club. */
async function openCard(userId: string, storyId: string, now: Date) {
  const story = await db.story.findUnique({ where: { id: storyId }, select: { clubId: true, authorId: true, kind: true, expiresAt: true, deletedAt: true, collectionId: true } });
  if (!story || story.kind !== "WIN_CARD" || story.deletedAt || (story.expiresAt <= now && !story.collectionId)) throw CLUB_NOT_FOUND;
  await requireClubMember(userId, story.clubId);
  return story;
}

/** Réaction 🎾 : une par membre et par carte, retirée si on la touche de nouveau. Jamais sur sa propre carte. */
export async function toggleReaction(actorId: string, storyId: string, now = new Date()): Promise<{ reacted: boolean }> {
  const story = await openCard(actorId, storyId, now);
  if (story.authorId === actorId) throw new DomainError("FORBIDDEN", "Tu ne peux pas réagir à ta propre carte");
  const key = { storyId_userId: { storyId, userId: actorId } };
  const existing = await db.storyReaction.findUnique({ where: key, select: { userId: true } });
  if (existing) {
    await db.storyReaction.deleteMany({ where: { storyId, userId: actorId } });
    return { reacted: false };
  }
  try {
    await db.storyReaction.create({ data: { storyId, userId: actorId, createdAt: now } });
  } catch (e) {
    if (!isUniqueViolation(e)) throw e; // deux touchers en même temps : la réaction existe déjà
  }
  return { reacted: true };
}

/** Signale une carte aux admins du club (un signalement par membre et par carte ; jamais sa propre carte). */
export async function reportStory(actorId: string, storyId: string, rawReason: string, now = new Date()): Promise<void> {
  const reason = reportReasonSchema.safeParse(rawReason);
  if (!reason.success) throw new DomainError("STORY_INVALID", reason.error.issues[0]?.message ?? "Motif invalide");
  const story = await openCard(actorId, storyId, now);
  if (story.authorId === actorId) throw new DomainError("FORBIDDEN", "Tu ne peux pas signaler ta propre carte");
  try {
    await db.storyReport.create({ data: { storyId, reporterId: actorId, reason: reason.data, createdAt: now } });
  } catch (e) {
    if (isUniqueViolation(e)) throw new DomainError("ALREADY_REPORTED", "Tu as déjà signalé cette carte");
    throw e;
  }
}

export type PendingReport = {
  storyId: string;
  comment: string;
  authorName: string;
  matchLabel: string;
  reports: { reason: string | null; createdAt: Date }[];
};

/** Signalements non traités des cartes du club, pour ses admins (sans le nom de ceux qui signalent : l'auteur n'en saura rien, les admins non plus). */
export async function listPendingReports(actorId: string, clubId: string): Promise<PendingReport[]> {
  await requireClubAdmin(actorId, clubId);
  const rows = await db.story.findMany({
    where: { clubId, deletedAt: null, reports: { some: { handledAt: null } } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      body: true,
      author: { select: { displayName: true } },
      prediction: { select: predictionCardSelect },
      reports: { where: { handledAt: null }, orderBy: { createdAt: "asc" }, select: { reason: true, createdAt: true } },
    },
  });
  return rows.map((r) => ({
    storyId: r.id,
    comment: r.body,
    authorName: r.author.displayName,
    matchLabel: r.prediction ? toWinCardData(r.prediction).matchLabel : "",
    reports: r.reports,
  }));
}

/** Un admin écarte les signalements d'une carte (elle reste en place). Pour la retirer : `deleteStory`. */
export async function dismissReports(actorId: string, storyId: string, now = new Date()): Promise<void> {
  const story = await db.story.findUnique({ where: { id: storyId }, select: { clubId: true } });
  if (!story) throw CLUB_NOT_FOUND;
  await requireClubAdmin(actorId, story.clubId);
  await db.storyReport.updateMany({ where: { storyId, handledAt: null }, data: { handledAt: now, handledById: actorId } });
}
