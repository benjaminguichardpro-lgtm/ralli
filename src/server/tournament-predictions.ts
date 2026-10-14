import { db } from "@/lib/db";
import { MIN_COMMITTED_ACES } from "@/lib/predictions/payout";
import { DomainError, isUniqueViolation } from "./errors";
import { getClubRole } from "./permissions";
import { type PlaceInput, balanceIn } from "./predictions";
import { tournamentExclusion } from "./tournaments";

const MATCH_NOT_FOUND = new DomainError("NOT_FOUND", "Match introuvable");

/** Vrai si cet identifiant est celui d'un match de tournoi (les identifiants sont uniques d'une table à l'autre). */
export async function isTournamentMatch(id: string): Promise<boolean> {
  return (await db.tournamentMatch.count({ where: { id } })) > 0;
}

/**
 * Pronostic sur un match de tournoi : mêmes règles que les interclubs (membre du club, anti-trucage, cote copiée, solde, un pronostic par
 * match), plus : tournoi en cours, deux joueurs connus, cotes figées, heure de début fixée et pas encore passée, pas de résultat.
 */
export async function placeTournamentPrediction(userId: string, input: PlaceInput, now = new Date()): Promise<{ id: string }> {
  const { matchId, side, committedAces } = input;
  if (!Number.isSafeInteger(committedAces) || committedAces < MIN_COMMITTED_ACES) {
    throw new DomainError("INVALID", `Minimum ${MIN_COMMITTED_ACES} Aces, en nombre entier`);
  }
  try {
    return await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`; // deux pronostics simultanés : l'un après l'autre
      const m = await tx.tournamentMatch.findUnique({
        where: { id: matchId },
        select: { id: true, startsAt: true, outcome: true, homePlayerId: true, awayPlayerId: true, oddsHomeX100: true, oddsAwayX100: true, tournament: { select: { id: true, clubId: true, status: true, club: { select: { deletedAt: true } } } } },
      });
      if (!m || m.tournament.club.deletedAt) throw MATCH_NOT_FOUND;
      const t = m.tournament;
      // Un non-membre ne distingue pas « inexistant » de « fermé » ; un brouillon n'existe que pour les admins (qui ne pronostiquent pas).
      if (!(await getClubRole(userId, t.clubId, tx)) || t.status === "DRAFT") throw MATCH_NOT_FOUND;
      if (t.status !== "OPEN" || m.outcome || !m.startsAt || m.startsAt.getTime() <= now.getTime()) throw new DomainError("INVALID_TRANSITION", "Les pronostics sont fermés pour ce match");
      if (!m.homePlayerId || !m.awayPlayerId) throw new DomainError("INVALID_TRANSITION", "Les deux joueurs ne sont pas encore connus");
      const reason = await tournamentExclusion(tx, userId, t);
      if (reason) throw new DomainError("FORBIDDEN", reason);

      const odds = side === "HOME" ? m.oddsHomeX100 : m.oddsAwayX100;
      if (odds === null) throw new DomainError("INVALID", "Les cotes de ce match ne sont pas disponibles");
      if (await tx.prediction.findUnique({ where: { userId_tournamentMatchId: { userId, tournamentMatchId: matchId } }, select: { id: true } })) {
        throw new DomainError("CONFLICT", "Vous avez déjà pronostiqué ce match");
      }
      const balance = await balanceIn(tx, userId);
      if (committedAces > balance) throw new DomainError("INVALID", `Solde insuffisant : vous avez ${balance.toLocaleString("fr-FR")} Aces`);

      const p = await tx.prediction.create({ data: { userId, tournamentMatchId: matchId, pickedSide: side, committedAces, oddsX100: odds }, select: { id: true } });
      await tx.ledgerEntry.create({ data: { userId, type: "PREDICTION_COMMIT", amount: -committedAces, predictionId: p.id, idempotencyKey: `commit:${p.id}` } });
      return p;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new DomainError("CONFLICT", "Vous avez déjà pronostiqué ce match");
    throw err;
  }
}
