import type { ClubRole } from "@/generated/prisma/client";
import { generateInviteCode, isWellFormedInviteCode } from "@/lib/clubs/invite-code";
import { db } from "@/lib/db";
import { DomainError, isUniqueViolation } from "./errors";
import { CLUB_NOT_FOUND, getClubRole, requireClubAdmin, requireClubMember } from "./permissions";

// Toutes les fonctions prennent l'identifiant de l'acteur et vérifient ses droits en base :
// l'UI peut masquer un bouton, mais c'est ici que le cloisonnement est garanti.

/** Réessaie en cas de collision (rarissime) sur le code d'invitation. */
async function withFreshInviteCode<T>(fn: (code: string) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await fn(generateInviteCode());
    } catch (e) {
      if (!isUniqueViolation(e, "inviteCode")) throw e;
    }
  }
  throw new Error("Impossible de générer un code d'invitation unique");
}

export async function createClub(actorId: string, name: string): Promise<{ id: string; inviteCode: string }> {
  return withFreshInviteCode((inviteCode) =>
    db.club.create({
      data: {
        name,
        inviteCode,
        createdById: actorId,
        memberships: { create: { userId: actorId, role: "ADMIN" } },
      },
      select: { id: true, inviteCode: true },
    }),
  );
}

/** Club derrière un code d'invitation (page du lien d'invitation) ; null si le code est faux. Ne donne que le nom. */
export async function findClubByInviteCode(rawCode: string): Promise<{ id: string; name: string } | null> {
  if (!isWellFormedInviteCode(rawCode)) return null;
  return db.club.findUnique({ where: { inviteCode: rawCode }, select: { id: true, name: true } });
}

export async function joinClubByCode(actorId: string, rawCode: string): Promise<{ clubId: string }> {
  const invalid = new DomainError("INVALID_INVITE_CODE", "Code d'invitation invalide");
  if (!isWellFormedInviteCode(rawCode)) throw invalid;
  const club = await db.club.findUnique({ where: { inviteCode: rawCode }, select: { id: true } });
  if (!club) throw invalid;
  if (await getClubRole(actorId, club.id)) {
    throw new DomainError("ALREADY_MEMBER", "Vous êtes déjà membre de ce club");
  }
  try {
    await db.clubMembership.create({ data: { userId: actorId, clubId: club.id, role: "MEMBER" } });
  } catch (e) {
    if (isUniqueViolation(e)) throw new DomainError("ALREADY_MEMBER", "Vous êtes déjà membre de ce club");
    throw e;
  }
  return { clubId: club.id };
}

export async function regenerateInviteCode(actorId: string, clubId: string): Promise<string> {
  await requireClubAdmin(actorId, clubId);
  const club = await withFreshInviteCode((inviteCode) =>
    db.club.update({ where: { id: clubId }, data: { inviteCode }, select: { inviteCode: true } }),
  );
  return club.inviteCode;
}

export async function setMemberRole(actorId: string, clubId: string, targetUserId: string, role: ClubRole): Promise<void> {
  await requireClubAdmin(actorId, clubId);
  await db.$transaction(async (tx) => {
    const target = await tx.clubMembership.findUnique({
      where: { userId_clubId: { userId: targetUserId, clubId } },
      select: { role: true },
    });
    if (!target) throw new DomainError("NOT_FOUND", "Ce compte n'est pas membre du club");
    if (target.role === role) return;
    if (target.role === "ADMIN" && role === "MEMBER") {
      const admins = await tx.clubMembership.count({ where: { clubId, role: "ADMIN" } });
      if (admins <= 1) throw new DomainError("LAST_ADMIN", "Le club doit garder au moins un admin");
    }
    await tx.clubMembership.update({
      where: { userId_clubId: { userId: targetUserId, clubId } },
      data: { role },
    });
  }, { isolationLevel: "Serializable" }); // deux admins qui se retirent le rôle en même temps
}

export type MyClub = { id: string; name: string; role: ClubRole };

export async function listMyClubs(userId: string): Promise<MyClub[]> {
  const rows = await db.clubMembership.findMany({
    where: { userId },
    select: { role: true, club: { select: { id: true, name: true } } },
    orderBy: { club: { name: "asc" } },
  });
  return rows.map((r) => ({ id: r.club.id, name: r.club.name, role: r.role }));
}

export type ClubView = {
  id: string;
  name: string;
  myRole: ClubRole;
  /** Visible des admins uniquement. */
  inviteCode: string | null;
  members: { userId: string; displayName: string; role: ClubRole; joinedAt: Date; avatarKey: string; avatarPhotoAt: Date | null }[];
};

/** Page club : réservée aux membres. Les emails ne sont jamais exposés. */
export async function getClubView(actorId: string, clubId: string): Promise<ClubView> {
  const myRole = await requireClubMember(actorId, clubId);
  const club = await db.club.findUnique({
    where: { id: clubId },
    select: {
      id: true,
      name: true,
      inviteCode: true,
      memberships: {
        select: { role: true, joinedAt: true, user: { select: { id: true, displayName: true, avatarKey: true, avatarPhotoAt: true } } },
        orderBy: [{ role: "desc" }, { joinedAt: "asc" }], // ADMIN avant MEMBER (ordre de l'enum)
      },
    },
  });
  if (!club) throw CLUB_NOT_FOUND;
  return {
    id: club.id,
    name: club.name,
    myRole,
    inviteCode: myRole === "ADMIN" ? club.inviteCode : null,
    members: club.memberships.map((m) => ({
      userId: m.user.id,
      displayName: m.user.displayName,
      avatarKey: m.user.avatarKey,
      avatarPhotoAt: m.user.avatarPhotoAt,
      role: m.role,
      joinedAt: m.joinedAt,
    })),
  };
}
