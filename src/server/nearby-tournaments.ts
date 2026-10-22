import { db } from "@/lib/db";
import { DomainError } from "./errors";
import { clubsForRadius } from "./nearby-clubs";
import { type TournamentCard, cardSelect, toCards } from "./tournaments";

// Onglet « Tournoi à venir » de l'accueil : les tournois publiés et pas terminés des clubs retenus par la barre de distance (0 km = mes clubs,
// 1 à 200 km autour de ma commune, toute la France). Un tournoi publié est public : on peut le suivre sans être membre du club ;
// seuls les membres le pronostiquent.

export type NearbyTournament = TournamentCard & {
  /** Distance à vol d'oiseau jusqu'au club organisateur ; null si l'un des deux n'est pas localisé. */
  distanceKm: number | null;
  isMember: boolean;
};

export type NearbyTournamentsResult = {
  radiusKm: number;
  commune: string | null;
  located: boolean;
  needsLocation: boolean;
  tournaments: NearbyTournament[];
};

const MAX_RESULTS = 60;

export async function listNearbyTournaments(userId: string, now = new Date()): Promise<NearbyTournamentsResult> {
  const me = await db.user.findUnique({ where: { id: userId }, select: { tournamentRadiusKm: true } });
  if (!me) throw new DomainError("NOT_FOUND", "Compte introuvable");
  const scope = await clubsForRadius(userId, me.tournamentRadiusKm);
  const head = { radiusKm: me.tournamentRadiusKm, commune: scope.commune, located: scope.located, needsLocation: scope.needsLocation };
  if (scope.needsLocation || scope.clubs.length === 0) return { ...head, tournaments: [] };
  const byClub = new Map(scope.clubs.map((c) => [c.id, c]));
  const rows = await db.tournament.findMany({
    where: { clubId: { in: [...byClub.keys()] }, status: "OPEN", club: { deletedAt: null } },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    select: cardSelect,
  });
  const cards = await toCards(rows, now);
  const tournaments = cards
    .map((c): NearbyTournament => ({ ...c, distanceKm: byClub.get(c.clubId)?.km ?? null, isMember: byClub.get(c.clubId)?.isMember ?? false }))
    // Le plus proche d'abord ; à distance égale (ou inconnue), le plus proche dans le temps. Les clubs non localisés passent après.
    .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) || a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id))
    .slice(0, MAX_RESULTS);
  return { ...head, tournaments };
}
