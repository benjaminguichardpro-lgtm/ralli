import type { ClubRole, TeamKind } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { DomainError } from "./errors";

// Contrôles de droits partagés par les services. Toujours relus en base, jamais déduits de l'UI.

export const CLUB_NOT_FOUND = new DomainError("NOT_FOUND", "Club introuvable");
export const ADMIN_ONLY = new DomainError("FORBIDDEN", "Action réservée aux admins du club");

export async function getClubRole(userId: string, clubId: string): Promise<ClubRole | null> {
  const m = await db.clubMembership.findUnique({
    where: { userId_clubId: { userId, clubId } },
    select: { role: true },
  });
  return m?.role ?? null;
}

/** Membre du club, sinon NOT_FOUND (un non-membre ne distingue pas « inexistant » de « fermé »). */
export async function requireClubMember(userId: string, clubId: string): Promise<ClubRole> {
  const role = await getClubRole(userId, clubId);
  if (!role) throw CLUB_NOT_FOUND;
  return role;
}

export async function requireClubAdmin(userId: string, clubId: string): Promise<void> {
  if ((await requireClubMember(userId, clubId)) !== "ADMIN") throw ADMIN_ONLY;
}

/** Vrai si l'utilisateur est capitaine d'au moins une équipe CLUB du club. */
export async function isCaptainInClub(userId: string, clubId: string): Promise<boolean> {
  const n = await db.team.count({ where: { clubId, kind: "CLUB", captainId: userId } });
  return n > 0;
}

type TeamRef = { clubId: string; kind: TeamKind; captainId: string | null };

/**
 * Peut gérer l'effectif d'une équipe :
 * - équipe du club : admin du club ou capitaine de CETTE équipe ;
 * - équipe externe (sans capitaine) : admin ou n'importe quel capitaine du club.
 * L'appelant doit déjà avoir vérifié l'appartenance au club.
 */
export async function canManageTeam(userId: string, role: ClubRole, team: TeamRef): Promise<boolean> {
  if (role === "ADMIN") return true;
  if (team.kind === "CLUB") return team.captainId === userId;
  return isCaptainInClub(userId, team.clubId);
}
