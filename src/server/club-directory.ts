import { db } from "@/lib/db";
import { clubMatchesQuery } from "@/lib/clubs/search";
import { DomainError, isUniqueViolation } from "./errors";
import { CLUB_NOT_FOUND, getClubRole, requireClubAdmin } from "./permissions";

// Annuaire des clubs : tous les clubs de Ralli sont publics. N'importe quel compte connecté les cherche, consulte leurs
// rencontres et peut les rejoindre d'un bouton ; seuls les membres pronostiquent. « Suivre » un club = en être membre.

export type ClubCard = {
  id: string;
  name: string;
  city: string | null;
  postalCode: string | null;
  logoUpdatedAt: Date | null;
  /** Nombre de personnes qui suivent le club (ses membres). */
  followers: number;
  isMember: boolean;
};

/** Clubs de Ralli correspondant à la recherche (nom, ville ou code postal, sans accents ni casse), les plus suivis d'abord. */
export async function searchClubs(userId: string, query = "", limit = 50): Promise<ClubCard[]> {
  const rows = await db.club.findMany({
    select: { id: true, name: true, city: true, postalCode: true, logoUpdatedAt: true, _count: { select: { memberships: true } }, memberships: { where: { userId }, select: { userId: true } } },
  });
  return rows
    .filter((c) => clubMatchesQuery(c, query))
    .map((c) => ({ id: c.id, name: c.name, city: c.city, postalCode: c.postalCode, logoUpdatedAt: c.logoUpdatedAt, followers: c._count.memberships, isMember: c.memberships.length > 0 }))
    .sort((a, b) => b.followers - a.followers || a.name.localeCompare(b.name, "fr"))
    .slice(0, limit);
}

export async function countFollowers(clubId: string): Promise<number> {
  return db.clubMembership.count({ where: { clubId } });
}

/** Un compte connecté rejoint un club d'un bouton (aucun code). */
export async function joinClub(actorId: string, clubId: string): Promise<void> {
  const club = await db.club.findUnique({ where: { id: clubId }, select: { id: true } });
  if (!club) throw CLUB_NOT_FOUND;
  // Un membre retiré par un admin ne revient pas d'un clic : il doit demander à revenir.
  const removal = await db.clubRemoval.findUnique({ where: { userId_clubId: { userId: actorId, clubId } }, select: { userId: true } });
  if (removal) throw new DomainError("REMOVED_FROM_CLUB", "Un admin t'a retiré de ce club : demande à revenir");
  try {
    await db.clubMembership.create({ data: { userId: actorId, clubId, role: "MEMBER" } });
  } catch (e) {
    if (isUniqueViolation(e)) throw new DomainError("ALREADY_MEMBER", "Tu es déjà membre de ce club");
    throw e;
  }
}

/**
 * Un membre quitte un club. Ses pronostics en cours restent valables. Refusé tant qu'il est :
 * - le dernier admin (un club garde au moins un admin) ;
 * - capitaine d'une équipe (le club doit d'abord changer de capitaine) ;
 * - lié à une fiche de joueur alignée dans une rencontre non réglée (sinon on contournerait l'anti-trucage).
 * Une fiche de joueur sans rencontre en cours est simplement déliée du compte.
 */
export async function leaveClub(actorId: string, clubId: string): Promise<void> {
  const role = await getClubRole(actorId, clubId);
  if (!role) throw CLUB_NOT_FOUND;
  if (role === "ADMIN") {
    const admins = await db.clubMembership.count({ where: { clubId, role: "ADMIN" } });
    if (admins <= 1) throw new DomainError("CANNOT_LEAVE", "Tu es le seul admin : nomme un autre admin avant de quitter le club");
  }
  const captaincies = await db.team.findMany({ where: { clubId, kind: "CLUB", captainId: actorId }, select: { name: true } });
  if (captaincies.length > 0) {
    throw new DomainError("CANNOT_LEAVE", `Tu es capitaine de ${captaincies.map((t) => t.name).join(", ")} : demande à un admin de changer de capitaine avant de quitter le club`);
  }
  const linked = await db.player.findMany({ where: { clubId, userId: actorId }, select: { id: true } });
  if (linked.length > 0) {
    const busy = await db.match.count({
      where: {
        OR: [{ homePlayerId: { in: linked.map((p) => p.id) } }, { awayPlayerId: { in: linked.map((p) => p.id) } }, { homePlayer2Id: { in: linked.map((p) => p.id) } }, { awayPlayer2Id: { in: linked.map((p) => p.id) } }],
        voidedAt: null,
        encounter: { status: { in: ["OPEN", "SCORE_PROPOSED"] } },
      },
    });
    if (busy > 0) throw new DomainError("CANNOT_LEAVE", "Tu es aligné dans une rencontre qui n'est pas terminée : tu pourras quitter le club après son règlement");
  }
  await db.$transaction([
    db.player.updateMany({ where: { clubId, userId: actorId }, data: { userId: null } }),
    db.clubMembership.delete({ where: { userId_clubId: { userId: actorId, clubId } } }),
  ]);
}

/**
 * Un admin retire un membre simple. Refusé pour soi-même (il y a « Quitter »), pour un admin (retirer d'abord son rôle)
 * et pour un capitaine d'équipe (le club doit d'abord changer de capitaine). Ses pronostics en cours restent valables,
 * le lien avec sa fiche de joueur aussi. Il ne peut plus rejoindre d'un clic : voir `requestReturn`.
 */
export async function removeMember(actorId: string, clubId: string, targetUserId: string): Promise<void> {
  await requireClubAdmin(actorId, clubId);
  if (actorId === targetUserId) throw new DomainError("CANNOT_REMOVE", "Pour partir toi-même, utilise « Quitter le club »");
  await db.$transaction(async (tx) => {
    const target = await tx.clubMembership.findUnique({ where: { userId_clubId: { userId: targetUserId, clubId } }, select: { role: true } });
    if (!target) throw new DomainError("NOT_FOUND", "Ce compte n'est pas membre du club");
    if (target.role === "ADMIN") throw new DomainError("CANNOT_REMOVE", "Retire d'abord son rôle d'admin, puis retire-le du club");
    const captaincies = await tx.team.findMany({ where: { clubId, kind: "CLUB", captainId: targetUserId }, select: { name: true } });
    if (captaincies.length > 0) {
      throw new DomainError("CANNOT_REMOVE", `Désigne d'abord un autre capitaine pour ${captaincies.map((t) => t.name).join(", ")}`);
    }
    await tx.clubMembership.delete({ where: { userId_clubId: { userId: targetUserId, clubId } } });
    await tx.clubRemoval.upsert({
      where: { userId_clubId: { userId: targetUserId, clubId } },
      create: { userId: targetUserId, clubId, removedById: actorId },
      update: { removedById: actorId, removedAt: new Date(), requestedAt: null },
    });
  }, { isolationLevel: "Serializable" });
}

/** Retiré du club ? `requestedAt` non vide : la demande de retour est en attente. Null : la personne n'a jamais été retirée. */
export async function getMyRemoval(userId: string, clubId: string): Promise<{ requestedAt: Date | null } | null> {
  return db.clubRemoval.findUnique({ where: { userId_clubId: { userId, clubId } }, select: { requestedAt: true } });
}

/** « Demander à revenir » : une seule demande en attente à la fois (c'est la même ligne). */
export async function requestReturn(actorId: string, clubId: string): Promise<void> {
  const removal = await db.clubRemoval.findUnique({ where: { userId_clubId: { userId: actorId, clubId } }, select: { requestedAt: true } });
  if (!removal) throw CLUB_NOT_FOUND;
  if (removal.requestedAt) throw new DomainError("REQUEST_PENDING", "Ta demande est déjà en attente");
  await db.clubRemoval.update({ where: { userId_clubId: { userId: actorId, clubId } }, data: { requestedAt: new Date() } });
}

export type ReturnRequest = { userId: string; displayName: string; avatarKey: string; avatarPhotoAt: Date | null; requestedAt: Date };

/** Demandes de retour en attente, pour les admins du club. */
export async function listReturnRequests(actorId: string, clubId: string): Promise<ReturnRequest[]> {
  await requireClubAdmin(actorId, clubId);
  const rows = await db.clubRemoval.findMany({
    where: { clubId, requestedAt: { not: null } },
    select: { requestedAt: true, user: { select: { id: true, displayName: true, avatarKey: true, avatarPhotoAt: true } } },
    orderBy: { requestedAt: "asc" },
  });
  return rows.map((r) => ({ userId: r.user.id, displayName: r.user.displayName, avatarKey: r.user.avatarKey, avatarPhotoAt: r.user.avatarPhotoAt, requestedAt: r.requestedAt! }));
}

/** Un admin accepte (la personne redevient membre simple) ou refuse (elle reste retirée et peut redemander). */
export async function decideReturn(actorId: string, clubId: string, targetUserId: string, accept: boolean): Promise<void> {
  await requireClubAdmin(actorId, clubId);
  await db.$transaction(async (tx) => {
    const removal = await tx.clubRemoval.findUnique({ where: { userId_clubId: { userId: targetUserId, clubId } }, select: { requestedAt: true } });
    if (!removal || !removal.requestedAt) throw new DomainError("NOT_FOUND", "Aucune demande en attente pour ce compte");
    if (accept) {
      await tx.clubRemoval.delete({ where: { userId_clubId: { userId: targetUserId, clubId } } });
      await tx.clubMembership.create({ data: { userId: targetUserId, clubId, role: "MEMBER" } });
    } else {
      await tx.clubRemoval.update({ where: { userId_clubId: { userId: targetUserId, clubId } }, data: { requestedAt: null } });
    }
  });
}
