import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { LocateResult } from "@/lib/location";
import { makeUser } from "../../tests/db/factories";
import { joinClub } from "./club-directory";
import { createClub } from "./clubs";
import { setMyPostalCode, setMyRadius } from "./nearby";
import { listNearbyTournaments } from "./nearby-tournaments";
import { addNewEntry, createTournament, publishTournament, setFirstRound } from "./tournaments";

// Onglet « Tournoi à venir » : barre de distance (0 = mes clubs, 1 à 200 km, toute la France), tournois publiés et pas terminés,
// le plus proche d'abord, distance et « Membre » sur chaque carte, jamais un brouillon.

const T0 = new Date("2026-10-10T10:00:00Z");
const NOW = new Date("2026-10-12T08:00:00Z");
const at = (days: number) => new Date(NOW.getTime() + days * 24 * 3_600_000);
const LYON = { latitude: 45.758, longitude: 4.8351 };
const VILLEFRANCHE = { latitude: 45.99, longitude: 4.72 }; // ~27 km de Lyon
const GRENOBLE = { latitude: 45.1885, longitude: 5.7245 }; // ~105 km de Lyon

const found = (): ((code: string) => Promise<LocateResult>) => async () => ({ status: "FOUND", commune: { name: "Lyon", position: LYON } });

let n = 0;
/** Un club (placé ou non) avec un tournoi de 4 joueurs, publié ou en brouillon. */
async function clubWithTournament(name: string, position: { latitude: number; longitude: number } | null, startsAt: Date, opts: { publish?: boolean } = {}) {
  n++;
  const admin = await makeUser(`AdminT${n}`);
  const club = await createClub(admin, name);
  if (position) await db.club.update({ where: { id: club.id }, data: position });
  const t = await createTournament(admin, club.id, { name: `Tournoi ${name}`, drawSize: 4, startsAt });
  const ids: string[] = [];
  for (const [i, last] of ["Un", "Deux", "Trois", "Quatre"].entries()) ids.push((await addNewEntry(admin, t.id, { firstName: `J${n}${i}`, lastName: last, fftRank: "R30" })).playerId);
  await setFirstRound(admin, t.id, [
    { position: 0, homePlayerId: ids[0]!, awayPlayerId: ids[1]!, startsAt: at(2) },
    { position: 1, homePlayerId: ids[2]!, awayPlayerId: ids[3]!, startsAt: at(2) },
  ]);
  if (opts.publish !== false) await publishTournament(admin, t.id, T0);
  return { clubId: club.id, tournamentId: t.id, admin };
}

let me: string;
beforeEach(async () => {
  me = await makeUser("Moi");
});

describe("tournois à venir : la barre de distance", () => {
  it("par défaut 0 km : seulement les tournois de mes clubs (comme avant), sans code postal", async () => {
    const mine = await clubWithTournament("TC Mien", null, at(3));
    await joinClub(me, mine.clubId);
    await clubWithTournament("TC Autre", LYON, at(1));
    const r = await listNearbyTournaments(me, NOW);
    expect(r).toMatchObject({ radiusKm: 0, needsLocation: false });
    expect(r.tournaments.map((t) => t.id)).toEqual([mine.tournamentId]);
    expect(r.tournaments[0]).toMatchObject({ isMember: true, distanceKm: null, name: "Tournoi TC Mien" });
  });

  it("1 à 200 km : les clubs du rayon, le plus proche d'abord, avec leur distance ; sans code postal on le demande", async () => {
    const far = await clubWithTournament("TC Grenoble", GRENOBLE, at(1));
    const near = await clubWithTournament("TC Villefranche", VILLEFRANCHE, at(5));
    const lyon = await clubWithTournament("TC Lyon", { latitude: 45.75, longitude: 4.85 }, at(9));
    await setMyRadius(me, 120, "tournois");
    expect(await listNearbyTournaments(me, NOW)).toMatchObject({ needsLocation: true, tournaments: [] });
    await setMyPostalCode(me, "69003", found());
    const r = await listNearbyTournaments(me, NOW);
    expect(r).toMatchObject({ needsLocation: false, located: true, commune: "Lyon", radiusKm: 120 });
    expect(r.tournaments.map((t) => t.id)).toEqual([lyon.tournamentId, near.tournamentId, far.tournamentId]); // distance, pas date
    expect(r.tournaments[0]!.distanceKm!).toBeLessThan(5);
    expect(r.tournaments[1]!.distanceKm!).toBeGreaterThan(25);
    expect(r.tournaments[2]!.distanceKm!).toBeGreaterThan(90);
    await setMyRadius(me, 50, "tournois");
    expect((await listNearbyTournaments(me, NOW)).tournaments.map((t) => t.id)).toEqual([lyon.tournamentId, near.tournamentId]); // Grenoble sort du rayon
  });

  it("toute la France : tous les clubs, les non localisés en dernier ; marque « Membre » sur les siens", async () => {
    const unplaced = await clubWithTournament("TC Sans Adresse", null, at(1));
    const grenoble = await clubWithTournament("TC Grenoble", GRENOBLE, at(4));
    await joinClub(me, grenoble.clubId);
    await setMyPostalCode(me, "69003", found());
    await setMyRadius(me, 999, "tournois");
    const r = await listNearbyTournaments(me, NOW);
    expect(r.tournaments.map((t) => t.id)).toEqual([grenoble.tournamentId, unplaced.tournamentId]);
    expect(r.tournaments.map((t) => t.isMember)).toEqual([true, false]);
    expect(r.tournaments[1]!.distanceKm).toBeNull();
  });

  it("toute la France marche sans code postal", async () => {
    const t = await clubWithTournament("TC Grenoble", GRENOBLE, at(1));
    await setMyRadius(me, 999, "tournois");
    const r = await listNearbyTournaments(me, NOW);
    expect(r).toMatchObject({ needsLocation: false, located: false });
    expect(r.tournaments.map((x) => x.id)).toEqual([t.tournamentId]);
    expect(r.tournaments[0]!.distanceKm).toBeNull();
  });

  it("jamais un brouillon, un tournoi terminé, annulé ni d'un club supprimé", async () => {
    await clubWithTournament("TC Brouillon", LYON, at(1), { publish: false });
    const finished = await clubWithTournament("TC Fini", LYON, at(2));
    await db.tournament.update({ where: { id: finished.tournamentId }, data: { status: "FINISHED", finishedAt: NOW } });
    const cancelled = await clubWithTournament("TC Annulé", LYON, at(3));
    await db.tournament.update({ where: { id: cancelled.tournamentId }, data: { status: "CANCELLED" } });
    const deleted = await clubWithTournament("TC Supprimé", LYON, at(4));
    await db.club.update({ where: { id: deleted.clubId }, data: { deletedAt: NOW } });
    const open = await clubWithTournament("TC Ouvert", LYON, at(5));
    await setMyRadius(me, 999, "tournois");
    expect((await listNearbyTournaments(me, NOW)).tournaments.map((t) => t.id)).toEqual([open.tournamentId]);
  });

  it("le réglage des tournois est indépendant de celui des interclubs", async () => {
    await setMyRadius(me, 999); // interclubs : toute la France
    const t = await clubWithTournament("TC Autre", LYON, at(1));
    expect((await listNearbyTournaments(me, NOW)).tournaments).toEqual([]); // tournois : toujours 0 km
    await setMyRadius(me, 999, "tournois");
    expect((await listNearbyTournaments(me, NOW)).tournaments.map((x) => x.id)).toEqual([t.tournamentId]);
  });
});
