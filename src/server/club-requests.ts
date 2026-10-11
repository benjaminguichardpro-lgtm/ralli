import type { ClubCreationRequest } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { ClubRequestInput } from "@/lib/validation/club-request";
import { createClub } from "./clubs";
import { DomainError, isUniqueViolation } from "./errors";

// Créer un club est réservé aux comptes dont la demande « admin de club » a été acceptée (par l'équipe Ralli,
// pour l'instant directement en base). Chaque demande acceptée donne droit à un seul club.

const CLAIMING = "claiming";

/** Dernière demande du compte (la plus récente), pour l'écran de suivi. */
export async function getLatestClubRequest(userId: string): Promise<ClubCreationRequest | null> {
  return db.clubCreationRequest.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
}

/** Vrai si le compte a une demande acceptée dont le club n'a pas encore été créé. */
export async function canCreateClub(userId: string): Promise<boolean> {
  const n = await db.clubCreationRequest.count({ where: { userId, status: "APPROVED", clubId: null } });
  return n > 0;
}

export async function submitClubRequest(userId: string, input: ClubRequestInput): Promise<void> {
  try {
    await db.clubCreationRequest.create({ data: { userId, ...input } });
  } catch (e) {
    if (isUniqueViolation(e)) throw new DomainError("REQUEST_PENDING", "Une demande est déjà en cours d'examen");
    throw e;
  }
}

/** Crée le club en consommant une demande acceptée ; refuse sans demande acceptée disponible. */
export async function createClubWithApproval(userId: string, name: string): Promise<{ id: string; inviteCode: string }> {
  const approved = await db.clubCreationRequest.findFirst({
    where: { userId, status: "APPROVED", clubId: null },
    select: { id: true },
  });
  const denied = new DomainError("CLUB_CREATION_NOT_ALLOWED", "Tu dois d'abord faire valider ta demande d'admin de club");
  if (!approved) throw denied;
  // On réserve la demande avant de créer, pour qu'un double clic ne crée pas deux clubs.
  const claim = await db.clubCreationRequest.updateMany({ where: { id: approved.id, clubId: null }, data: { clubId: CLAIMING } });
  if (claim.count === 0) throw denied;
  try {
    const club = await createClub(userId, name);
    await db.clubCreationRequest.update({ where: { id: approved.id }, data: { clubId: club.id } });
    return club;
  } catch (e) {
    await db.clubCreationRequest.update({ where: { id: approved.id }, data: { clubId: null } });
    throw e;
  }
}
