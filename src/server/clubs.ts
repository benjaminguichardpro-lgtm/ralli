import type { ClubRole } from "@/generated/prisma/client";
import type { ClubProfileFields } from "@/lib/clubs/profile";
import { db } from "@/lib/db";
import { DomainError } from "./errors";
import { CLUB_NOT_FOUND, requireClubAdmin, requireClubMember } from "./permissions";

// Toutes les fonctions prennent l'identifiant de l'acteur et vérifient ses droits en base :
// l'UI peut masquer un bouton, mais c'est ici que le cloisonnement est garanti.

export async function createClub(actorId: string, name: string): Promise<{ id: string }> {
  return db.club.create({
    data: {
      name,
      createdById: actorId,
      memberships: { create: { userId: actorId, role: "ADMIN" } },
    },
    select: { id: true },
  });
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

export type MyClub = { id: string; name: string; role: ClubRole; logoUpdatedAt: Date | null };

export async function listMyClubs(userId: string): Promise<MyClub[]> {
  const rows = await db.clubMembership.findMany({
    where: { userId },
    select: { role: true, club: { select: { id: true, name: true, logoUpdatedAt: true } } },
    orderBy: { club: { name: "asc" } },
  });
  return rows.map((r) => ({ id: r.club.id, name: r.club.name, role: r.role, logoUpdatedAt: r.club.logoUpdatedAt }));
}

export type ClubView = {
  id: string;
  name: string;
  myRole: ClubRole;
  /** Fiche du club (champs facultatifs, voir server/club-profile.ts). */
  profile: ClubProfileFields & { logoUpdatedAt: Date | null };
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
      logoUpdatedAt: true,
      foundedYear: true,
      licenseeCount: true,
      address: true,
      postalCode: true,
      city: true,
      websiteUrl: true,
      description: true,
      indoorCourts: true,
      outdoorCourts: true,
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
    profile: {
      logoUpdatedAt: club.logoUpdatedAt,
      foundedYear: club.foundedYear,
      licenseeCount: club.licenseeCount,
      address: club.address,
      postalCode: club.postalCode,
      city: club.city,
      websiteUrl: club.websiteUrl,
      description: club.description,
      indoorCourts: club.indoorCourts,
      outdoorCourts: club.outdoorCourts,
    },
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
