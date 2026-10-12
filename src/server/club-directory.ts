import { db } from "@/lib/db";
import { clubMatchesQuery } from "@/lib/clubs/search";
import { DomainError, isUniqueViolation } from "./errors";
import { CLUB_NOT_FOUND, getClubRole } from "./permissions";

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
