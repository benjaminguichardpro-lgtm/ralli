import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { type CreateStoryInput, collectionNameKey, collectionNameSchema, createStorySchema, isStoryLive, storyExpiry } from "@/lib/stories";
import { type AvatarRef } from "@/lib/avatars";
import { DomainError, isUniqueViolation } from "./errors";
import { type WinCardData, predictionCardSelect, toWinCardData } from "./win-cards";
import { CLUB_NOT_FOUND, getClubRole, requireClubAdmin, requireClubMember } from "./permissions";

// Stories de club : visibles 24 h par les membres du club. Les droits sont relus en base à chaque appel.
// Le « à la une » du club est fait de collections nommées (comme les « à la une » d'Instagram) qui gardent des stories après leurs 24 h.

export type StoryView = {
  id: string;
  clubId: string;
  /** Annonce d'un admin ou d'un capitaine, ou carte de ralli gagnant partagée par un membre. */
  kind: "CLUB_POST" | "WIN_CARD";
  body: string;
  background: string;
  createdAt: Date;
  authorName: string;
  author: AvatarRef;
  /** C'est ma story : je ne peux ni y réagir ni la signaler. */
  isMine: boolean;
  /** Les chiffres de la carte (kind = WIN_CARD), lus en direct sur le ralli. */
  winCard: WinCardData | null;
  /** Réactions 🎾 : le nombre pour tous, les noms pour l'auteur et les admins seulement. */
  reactions: { count: number; mine: boolean; names: string[] | null };
  /** Membre du club, pas l'auteur, sur une carte : peut réagir et signaler. */
  canReact: boolean;
  reportedByMe: boolean;
  teamName: string | null;
  seen: boolean;
  /** Nombre de membres qui l'ont vue : seulement pour l'auteur et les admins, sinon null. */
  viewCount: number | null;
  canDelete: boolean;
  /** Admin du club : peut ajouter la story à la une ou l'en retirer. */
  canManageWall: boolean;
  /** Collection à la une qui garde cette story (null = pas à la une). */
  collection: { id: string; name: string } | null;
};

/** Un rond du bandeau : un club (stories pour tout le club) ou une équipe de ce club. */
export type StoryRing = {
  key: string;
  clubId: string;
  clubName: string;
  logoUpdatedAt: Date | null;
  teamName: string | null;
  /** Rond « Rallis gagnants » du club : regroupe ses cartes de ralli gagnant. */
  wins: boolean;
  stories: StoryView[];
  unseen: number;
};

/** Où l'utilisateur peut publier : admin = tout le club (et choisir une collection de la une) ; capitaine = ses équipes. */
export type PublishTarget = {
  clubId: string;
  clubName: string;
  isAdmin: boolean;
  teams: { id: string; name: string }[];
  collections: { id: string; name: string }[];
};

const liveWhere = (now: Date) => ({ deletedAt: null, expiresAt: { gt: now } });

type Tx = Prisma.TransactionClient;

/** Collection du club portant ce nom (sans tenir compte de la casse), créée au besoin. */
async function findOrCreateCollection(client: Tx | typeof db, clubId: string, rawName: string): Promise<string> {
  const parsed = collectionNameSchema.safeParse(rawName);
  if (!parsed.success) throw new DomainError("STORY_INVALID", parsed.error.issues[0]?.message ?? "Nom invalide");
  const name = parsed.data;
  const nameKey = collectionNameKey(name);
  const existing = await client.storyCollection.findUnique({ where: { clubId_nameKey: { clubId, nameKey } }, select: { id: true } });
  if (existing) return existing.id;
  try {
    return (await client.storyCollection.create({ data: { clubId, name, nameKey }, select: { id: true } })).id;
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    return (await client.storyCollection.findUniqueOrThrow({ where: { clubId_nameKey: { clubId, nameKey } }, select: { id: true } })).id;
  }
}

/** Collection choisie : existante (id, du bon club) ou nouvelle (nom). */
async function resolveCollection(clubId: string, pick: { collectionId?: string | null; collectionName?: string | null }): Promise<string> {
  if (pick.collectionId) {
    const c = await db.storyCollection.findUnique({ where: { id: pick.collectionId }, select: { clubId: true } });
    if (!c || c.clubId !== clubId) throw new DomainError("STORY_INVALID", "Cette collection n'existe pas dans ce club");
    return pick.collectionId;
  }
  return findOrCreateCollection(db, clubId, pick.collectionName ?? "");
}

/** Supprime une collection qui n'a plus aucune story (supprimée ou retirée). */
async function dropIfEmpty(collectionId: string | null): Promise<void> {
  if (!collectionId) return;
  const left = await db.story.count({ where: { collectionId, deletedAt: null } });
  if (left === 0) await db.storyCollection.deleteMany({ where: { id: collectionId } });
}

export async function createStory(actorId: string, raw: CreateStoryInput, now = new Date()): Promise<{ id: string }> {
  const parsed = createStorySchema.safeParse(raw);
  if (!parsed.success) throw new DomainError("STORY_INVALID", parsed.error.issues[0]?.message ?? "Story invalide");
  const input = parsed.data;
  const role = await requireClubMember(actorId, input.clubId);
  let teamId: string | null = null;
  let collectionId: string | null = null;
  if (role === "ADMIN") {
    // La une est réservé aux admins ; une story d'admin vaut pour tout le club.
    if (input.onWall) collectionId = await resolveCollection(input.clubId, input);
  } else {
    if (!input.teamId) throw new DomainError("FORBIDDEN", "Seuls les admins publient pour tout le club");
    const team = await db.team.findUnique({ where: { id: input.teamId }, select: { clubId: true, kind: true, captainId: true } });
    if (!team || team.clubId !== input.clubId || team.kind !== "CLUB" || team.captainId !== actorId) {
      throw new DomainError("FORBIDDEN", "Seul le capitaine d'une équipe publie pour elle");
    }
    teamId = input.teamId;
  }
  return db.story.create({
    data: { clubId: input.clubId, authorId: actorId, teamId, body: input.body, background: input.background, collectionId, expiresAt: storyExpiry(now), createdAt: now },
    select: { id: true },
  });
}

export async function listPublishTargets(userId: string): Promise<PublishTarget[]> {
  const memberships = await db.clubMembership.findMany({
    where: { userId },
    select: {
      role: true,
      club: {
        select: {
          id: true,
          name: true,
          teams: { where: { kind: "CLUB", captainId: userId }, select: { id: true, name: true }, orderBy: { name: "asc" } },
          storyCollections: { select: { id: true, name: true }, orderBy: { name: "asc" } },
        },
      },
    },
    orderBy: { club: { name: "asc" } },
  });
  return memberships
    .filter((m) => m.role === "ADMIN" || m.club.teams.length > 0)
    .map((m) => ({
      clubId: m.club.id,
      clubName: m.club.name,
      isAdmin: m.role === "ADMIN",
      teams: m.club.teams,
      collections: m.role === "ADMIN" ? m.club.storyCollections : [],
    }));
}

const storySelect = (userId: string) =>
  ({
    id: true,
    clubId: true,
    teamId: true,
    kind: true,
    body: true,
    background: true,
    createdAt: true,
    authorId: true,
    author: { select: { id: true, displayName: true, avatarKey: true, avatarPhotoAt: true } },
    prediction: { select: predictionCardSelect },
    reactions: { select: { userId: true, user: { select: { displayName: true } } }, orderBy: { createdAt: "asc" as const } },
    reports: { where: { reporterId: userId }, select: { reporterId: true } },
    team: { select: { name: true } },
    collection: { select: { id: true, name: true } },
    club: { select: { name: true, logoUpdatedAt: true, memberships: { where: { userId }, select: { role: true } } } },
    views: { select: { userId: true } },
  }) satisfies Prisma.StorySelect;

type StoryRow = Prisma.StoryGetPayload<{ select: ReturnType<typeof storySelect> }>;

function toView(r: StoryRow, userId: string): StoryView {
  const isAdmin = r.club.memberships[0]?.role === "ADMIN";
  const canSeeCount = isAdmin || r.authorId === userId;
  return {
    id: r.id,
    clubId: r.clubId,
    kind: r.kind,
    body: r.body,
    background: r.background,
    createdAt: r.createdAt,
    authorName: r.author.displayName,
    author: { id: r.author.id, avatarKey: r.author.avatarKey, avatarPhotoAt: r.author.avatarPhotoAt },
    isMine: r.authorId === userId,
    winCard: r.kind === "WIN_CARD" && r.prediction ? toWinCardData(r.prediction) : null,
    reactions: { count: r.reactions.length, mine: r.reactions.some((x) => x.userId === userId), names: canSeeCount ? r.reactions.map((x) => x.user.displayName) : null },
    canReact: r.kind === "WIN_CARD" && r.club.memberships.length > 0 && r.authorId !== userId,
    reportedByMe: r.reports.length > 0,
    teamName: r.team?.name ?? null,
    seen: r.views.some((v) => v.userId === userId),
    viewCount: canSeeCount ? r.views.filter((v) => v.userId !== r.authorId).length : null,
    canDelete: isAdmin || r.authorId === userId,
    canManageWall: isAdmin,
    collection: r.collection,
  };
}

/** Bandeau des stories : un rond par club et par équipe ayant une story vivante, non vues d'abord. `clubId` restreint à un club. */
export async function listStoryRings(userId: string, opts: { clubId?: string; now?: Date } = {}): Promise<StoryRing[]> {
  const now = opts.now ?? new Date();
  const rows = await db.story.findMany({
    where: { ...liveWhere(now), club: { memberships: { some: { userId } } }, ...(opts.clubId ? { clubId: opts.clubId } : {}) },
    orderBy: { createdAt: "asc" },
    select: storySelect(userId),
  });
  const rings = new Map<string, StoryRing & { latest: number }>();
  for (const r of rows) {
    const story = toView(r, userId);
    const wins = r.kind === "WIN_CARD";
    const key = wins ? `${r.clubId}:wins` : r.teamId ? `${r.clubId}:${r.teamId}` : r.clubId;
    let ring = rings.get(key);
    if (!ring) {
      ring = { key, clubId: r.clubId, clubName: r.club.name, logoUpdatedAt: r.club.logoUpdatedAt, teamName: wins ? null : (r.team?.name ?? null), wins, stories: [], unseen: 0, latest: 0 };
      rings.set(key, ring);
    }
    ring.stories.push(story);
    if (!story.seen) ring.unseen++;
    ring.latest = Math.max(ring.latest, r.createdAt.getTime());
  }
  return [...rings.values()]
    .sort((a, b) => Number(b.unseen > 0) - Number(a.unseen > 0) || b.latest - a.latest || a.key.localeCompare(b.key))
    .map(({ latest: _latest, ...ring }) => {
      void _latest;
      return ring;
    });
}

/** Marque une story comme vue (un membre du club, story encore vivante). Sans effet sinon : jamais d'erreur visible. */
export async function markStoryViewed(userId: string, storyId: string, now = new Date()): Promise<void> {
  const story = await db.story.findUnique({ where: { id: storyId }, select: { clubId: true, expiresAt: true, deletedAt: true } });
  if (!story || !isStoryLive(story, now)) return;
  const member = await db.clubMembership.findUnique({ where: { userId_clubId: { userId, clubId: story.clubId } }, select: { userId: true } });
  if (!member) return;
  try {
    await db.storyView.create({ data: { storyId, userId, seenAt: now } });
  } catch (e) {
    if (!isUniqueViolation(e)) throw e; // déjà vue
  }
}

/** Supprime une story : son auteur ou un admin du club. La ligne reste en base (deletedAt, deletedById). */
export async function deleteStory(actorId: string, storyId: string, now = new Date()): Promise<void> {
  const story = await db.story.findUnique({ where: { id: storyId }, select: { clubId: true, authorId: true, deletedAt: true, collectionId: true } });
  if (!story) throw CLUB_NOT_FOUND;
  const role = await requireClubMember(actorId, story.clubId);
  if (role !== "ADMIN" && story.authorId !== actorId) throw new DomainError("FORBIDDEN", "Tu ne peux supprimer que tes propres stories");
  if (story.deletedAt) return;
  await db.$transaction([
    db.story.update({ where: { id: storyId }, data: { deletedAt: now, deletedById: actorId, collectionId: null } }),
    // Une carte supprimée n'a plus de signalement à traiter.
    db.storyReport.updateMany({ where: { storyId, handledAt: null }, data: { handledAt: now, handledById: actorId } }),
  ]);
  await dropIfEmpty(story.collectionId);
}

export type WallCollection = {
  id: string;
  name: string;
  pinned: boolean;
  /** Couleur de la dernière story, pour le rond. */
  coverBackground: string;
  stories: StoryView[];
};

/**
 * « À la une » du club : ses collections, l'épinglée d'abord puis celle dont la dernière story est la plus récente.
 * Tout compte connecté peut la lire. Les stories d'une collection se lisent de la plus ancienne à la plus récente, même expirées.
 */
export async function listClubWall(userId: string, clubId: string): Promise<{ collections: WallCollection[]; isAdmin: boolean }> {
  // Les clubs sont publics : un compte qui n'est pas membre peut lire « à la une » (sans aucune commande).
  const role = await getClubRole(userId, clubId);
  const rows = await db.storyCollection.findMany({
    where: { clubId, stories: { some: { deletedAt: null } } },
    select: { id: true, name: true, pinnedAt: true, stories: { where: { deletedAt: null }, orderBy: { createdAt: "asc" }, select: storySelect(userId) } },
  });
  const collections = rows
    .map((c) => {
      const stories = c.stories.map((r) => toView(r, userId));
      return {
        id: c.id,
        name: c.name,
        pinned: c.pinnedAt !== null,
        coverBackground: stories[stories.length - 1]!.background,
        stories,
        latest: stories[stories.length - 1]!.createdAt.getTime(),
      };
    })
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.latest - a.latest || a.name.localeCompare(b.name, "fr"))
    .map(({ latest: _latest, ...c }) => {
      void _latest;
      return c;
    });
  return { collections, isAdmin: role === "ADMIN" };
}

/** Ajoute une story encore vivante à une collection de la une (existante ou nouvelle). Admins seulement. */
export async function addStoryToWall(
  actorId: string,
  storyId: string,
  pick: { collectionId?: string | null; collectionName?: string | null },
  now = new Date(),
): Promise<void> {
  const story = await db.story.findUnique({ where: { id: storyId }, select: { clubId: true, expiresAt: true, deletedAt: true, collectionId: true } });
  if (!story) throw CLUB_NOT_FOUND;
  await requireClubAdmin(actorId, story.clubId);
  if (!isStoryLive(story, now)) throw new DomainError("STORY_INVALID", "Cette story n'est plus visible : elle ne peut plus être ajoutée à la une");
  const collectionId = await resolveCollection(story.clubId, pick);
  await db.story.update({ where: { id: storyId }, data: { collectionId } });
  if (story.collectionId && story.collectionId !== collectionId) await dropIfEmpty(story.collectionId);
}

/** Retire une story de sa collection (elle reste visible jusqu'à ses 24 h). Admins seulement ; une collection vide disparaît. */
export async function removeStoryFromWall(actorId: string, storyId: string): Promise<void> {
  const story = await db.story.findUnique({ where: { id: storyId }, select: { clubId: true, collectionId: true } });
  if (!story) throw CLUB_NOT_FOUND;
  await requireClubAdmin(actorId, story.clubId);
  await db.story.update({ where: { id: storyId }, data: { collectionId: null } });
  await dropIfEmpty(story.collectionId);
}

/** Épingle (ou désépingle) une collection. Admins seulement ; épingler en remplace une autre. */
export async function setCollectionPinned(actorId: string, collectionId: string, pinned: boolean, now = new Date()): Promise<void> {
  const c = await db.storyCollection.findUnique({ where: { id: collectionId }, select: { clubId: true } });
  if (!c) throw CLUB_NOT_FOUND;
  await requireClubAdmin(actorId, c.clubId);
  if (!pinned) {
    await db.storyCollection.update({ where: { id: collectionId }, data: { pinnedAt: null } });
    return;
  }
  await db.$transaction([
    db.storyCollection.updateMany({ where: { clubId: c.clubId, pinnedAt: { not: null } }, data: { pinnedAt: null } }),
    db.storyCollection.update({ where: { id: collectionId }, data: { pinnedAt: now } }),
  ]);
}

/** Supprime une collection entière : ses stories ne sont plus à la une (elles ne sont pas supprimées). Admins seulement. */
export async function deleteCollection(actorId: string, collectionId: string): Promise<void> {
  const c = await db.storyCollection.findUnique({ where: { id: collectionId }, select: { clubId: true } });
  if (!c) throw CLUB_NOT_FOUND;
  await requireClubAdmin(actorId, c.clubId);
  await db.storyCollection.delete({ where: { id: collectionId } }); // les stories repassent à collectionId = null (SetNull)
}
