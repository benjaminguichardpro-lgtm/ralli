import { db } from "@/lib/db";
import { DomainError } from "./errors";
import { requireClubAdmin } from "./permissions";
import { refundPendingPredictions } from "./refunds";

/** Mot à saisir en toutes lettres pour confirmer la suppression d'un club. */
const DELETE_CONFIRMATION = "SUPPRIMER";

/** Rencontres pas encore terminées (« verrouillée » n'est pas un statut stocké : c'est une rencontre ouverte dont l'heure est passée) : annulées à la suppression du club (leurs pronostics en cours sont remboursés). */
const OPEN_STATUSES = ["DRAFT", "OPEN", "SCORE_PROPOSED", "DISPUTED"] as const;

/**
 * Supprime un club (admins). Suppression « douce » : le club, ses équipes et ses rencontres disparaissent partout (recherche,
 * carte, page publique, liens), les données restent en base. Dans une seule transaction :
 * - les rencontres non terminées sont annulées et tous les pronostics en cours remboursés (portefeuille intact, rien d'effacé) ;
 * - les adhésions sont retirées (la liste des membres et leur rôle est gardée sur le club, pour un éventuel rétablissement à la main) ;
 * - la page publique est coupée et son adresse libérée.
 * `confirmation` doit être exactement « SUPPRIMER » (revérifié ici : l'interface ne suffit pas).
 */
export async function deleteClub(actorId: string, clubId: string, confirmation: string, now = new Date()): Promise<{ refunded: number }> {
  await requireClubAdmin(actorId, clubId);
  if (confirmation !== DELETE_CONFIRMATION) throw new DomainError("INVALID", `Saisis « ${DELETE_CONFIRMATION} » en toutes lettres pour confirmer`);
  return db.$transaction(async (tx) => {
    const club = await tx.club.findFirst({ where: { id: clubId, deletedAt: null }, select: { id: true } });
    if (!club) throw new DomainError("NOT_FOUND", "Club introuvable");

    const encounters = await tx.encounter.findMany({ where: { organizerClubId: clubId, status: { in: [...OPEN_STATUSES] } }, select: { id: true, status: true } });
    for (const e of encounters) {
      await tx.encounter.update({ where: { id: e.id }, data: { status: "CANCELLED" } });
      await tx.encounterEvent.create({ data: { encounterId: e.id, fromStatus: e.status, toStatus: "CANCELLED", actorId, note: "Club supprimé" } });
    }
    // Tournois non terminés : annulés ; tous les pronostics en cours (interclubs et tournois) remboursés.
    await tx.tournament.updateMany({ where: { clubId, status: { in: ["DRAFT", "OPEN"] } }, data: { status: "CANCELLED" } });
    const refunded =
      (await refundPendingPredictions(tx, { match: { encounter: { organizerClubId: clubId } } }, now)) +
      (await refundPendingPredictions(tx, { tournamentMatch: { tournament: { clubId } } }, now));

    const members = await tx.clubMembership.findMany({ where: { clubId }, select: { userId: true, role: true } });
    await tx.clubMembership.deleteMany({ where: { clubId } });
    await tx.club.update({
      where: { id: clubId },
      data: { deletedAt: now, deletedById: actorId, deletedMembership: members, publicPage: false, slug: null },
    });
    return { refunded };
  });
}
