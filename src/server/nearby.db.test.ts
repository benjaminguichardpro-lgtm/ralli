import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import type { LocateResult } from "@/lib/location";
import { makeUser } from "../../tests/db/factories";
import { joinClub } from "./club-directory";
import { createClub } from "./clubs";
import { addMatch, createEncounter, publishEncounter } from "./encounters";
import { getMyLocation, listNearbyEncounters, setMyPostalCode, setMyRadius } from "./nearby";
import { addNewPlayerToTeam, createExternalTeam, createTeam } from "./teams";

// Rencontres à proximité : code postal (privé, vérifié), rayon réglable (30 km par défaut), clubs placés sur la carte.

const T0 = new Date("2026-10-10T10:00:00Z");
const NOW = new Date("2026-10-12T08:00:00Z");
const at = (days: number) => new Date(NOW.getTime() + days * 24 * 3_600_000);

const LYON = { latitude: 45.758, longitude: 4.8351 }; // centre de la commune de la personne
const VILLEFRANCHE = { latitude: 45.99, longitude: 4.72 }; // ~27 km de Lyon
const GRENOBLE = { latitude: 45.1885, longitude: 5.7245 }; // ~105 km de Lyon

const found = (name: string, position = LYON): (code: string) => Promise<LocateResult> => async () => ({ status: "FOUND", commune: { name, position } });

let n = 0;
/** Un club avec une rencontre publiée à `startsAt`, placé sur la carte (ou non). */
async function clubWithEncounter(name: string, position: { latitude: number; longitude: number } | null, startsAt: Date, opts: { publish?: boolean } = {}) {
  n++;
  const admin = await makeUser(`Admin${n}`);
  const cap = await makeUser(`Cap${n}`);
  const club = await createClub(admin, name);
  await joinClub(cap, club.id);
  if (position) await db.club.update({ where: { id: club.id }, data: position });
  const team = (await createTeam(admin, club.id, { name: "Messieurs 1", captainUserId: cap })).id;
  const ext = (await createExternalTeam(admin, club.id, { name: "TC Voisin", externalClubName: "TC Voisin" })).id;
  const mine = (await addNewPlayerToTeam(admin, team, { firstName: "Léa", lastName: "Martin", fftRank: "R30" })).id;
  const theirs = (await addNewPlayerToTeam(admin, ext, { firstName: "Paul", lastName: "Voisin", fftRank: "R30" })).id;
  const encounterId = (await createEncounter(cap, { clubTeamId: team, opponentTeamId: ext, clubTeamIsHome: true, startsAt }, T0)).id;
  await addMatch(cap, encounterId, { homePlayerId: mine, awayPlayerId: theirs }, T0);
  if (opts.publish !== false) await publishEncounter(cap, encounterId, T0);
  return { clubId: club.id, encounterId, admin };
}

let me: string;
beforeEach(async () => {
  me = await makeUser("Moi");
});

describe("code postal du compte", () => {
  it("par défaut : pas de position, rayon de 30 km", async () => {
    expect(await getMyLocation(me)).toEqual({ postalCode: null, commune: null, located: false, radiusKm: 30 });
    expect(await listNearbyEncounters(me, NOW)).toBeNull();
  });

  it("un code valide enregistre la commune et sa position (le centre de la commune)", async () => {
    await expect(setMyPostalCode(me, " 69 003 ", found("Lyon"))).resolves.toEqual({ commune: "Lyon" });
    expect(await getMyLocation(me)).toMatchObject({ postalCode: "69003", commune: "Lyon", located: true });
    expect(await db.user.findUniqueOrThrow({ where: { id: me }, select: { latitude: true, longitude: true } })).toEqual(LYON);
  });

  it("format invalide, code inconnu ou service en panne : refusé, et un code déjà enregistré est conservé", async () => {
    await setMyPostalCode(me, "69003", found("Lyon"));
    await expect(setMyPostalCode(me, "6900", found("X"))).rejects.toMatchObject({ code: "INVALID" });
    await expect(setMyPostalCode(me, "ABCDE", found("X"))).rejects.toMatchObject({ code: "INVALID" });
    await expect(setMyPostalCode(me, "99999", async () => ({ status: "UNKNOWN" }))).rejects.toMatchObject({ code: "INVALID", message: expect.stringContaining("introuvable") });
    await expect(setMyPostalCode(me, "75008", async () => ({ status: "UNAVAILABLE" }))).rejects.toMatchObject({ code: "INVALID", message: expect.stringContaining("réessaie") });
    expect(await getMyLocation(me)).toMatchObject({ postalCode: "69003", commune: "Lyon", located: true });
  });

  it("un champ vide efface le code, la commune et la position ; aucun appel au service", async () => {
    await setMyPostalCode(me, "69003", found("Lyon"));
    const locate = vi.fn(found("X"));
    await expect(setMyPostalCode(me, "", locate)).resolves.toEqual({ commune: null });
    expect(locate).not.toHaveBeenCalled();
    expect(await getMyLocation(me)).toMatchObject({ postalCode: null, commune: null, located: false });
    expect(await db.user.findUniqueOrThrow({ where: { id: me }, select: { latitude: true, longitude: true } })).toEqual({ latitude: null, longitude: null });
  });

  it("le code postal est privé : ni le pseudo public ni la liste des membres ne le portent", async () => {
    await setMyPostalCode(me, "69003", found("Lyon"));
    const { club } = { club: await createClub(await makeUser("Chef"), "TC Public") };
    await joinClub(me, club.id);
    const members = await db.clubMembership.findMany({ where: { clubId: club.id }, select: { user: { select: { displayName: true } } } });
    expect(JSON.stringify(members)).not.toContain("69003");
  });
});

describe("rayon", () => {
  it("1 à 200 km, entier ; gardé dans le compte", async () => {
    await expect(setMyRadius(me, "50")).resolves.toBe(50);
    expect((await getMyLocation(me)).radiusKm).toBe(50);
    await setMyRadius(me, 1);
    await setMyRadius(me, "200");
    for (const bad of ["0", "201", "-3", "12,5", "abc", "", "1e2"]) await expect(setMyRadius(me, bad), bad).rejects.toMatchObject({ code: "INVALID" });
    expect((await getMyLocation(me)).radiusKm).toBe(200);
  });

  it("la base refuse un rayon, un code postal ou une position absurdes", async () => {
    await expect(db.user.update({ where: { id: me }, data: { nearbyRadiusKm: 0 } })).rejects.toThrow();
    await expect(db.user.update({ where: { id: me }, data: { nearbyRadiusKm: 201 } })).rejects.toThrow();
    await expect(db.user.update({ where: { id: me }, data: { postalCode: "6900" } })).rejects.toThrow();
    await expect(db.user.update({ where: { id: me }, data: { latitude: 45 } })).rejects.toThrow();
    await expect(db.user.update({ where: { id: me }, data: { latitude: 95, longitude: 4 } })).rejects.toThrow();
  });
});

describe("rencontres à proximité", () => {
  beforeEach(async () => {
    await setMyPostalCode(me, "69003", found("Lyon"));
  });

  it("30 km par défaut : les clubs proches, triés par date de début (pas par distance), avec leur distance", async () => {
    const lyon = await clubWithEncounter("TC Lyon", { latitude: 45.75, longitude: 4.85 }, at(3));
    const villefranche = await clubWithEncounter("TC Villefranche", VILLEFRANCHE, at(1));
    await clubWithEncounter("TC Grenoble", GRENOBLE, at(2));
    const r = (await listNearbyEncounters(me, NOW))!;
    expect(r).toMatchObject({ radiusKm: 30, commune: "Lyon", clubsInRange: 2 });
    expect(r.encounters.map((e) => e.id)).toEqual([villefranche.encounterId, lyon.encounterId]);
    expect(r.encounters[0]!.distanceKm).toBeGreaterThan(25);
    expect(r.encounters[0]!.distanceKm).toBeLessThan(30);
    expect(r.encounters[1]!.distanceKm).toBeLessThan(3);
    expect(r.encounters[1]).toMatchObject({ home: "TC Lyon · Messieurs 1", away: "TC Voisin", club: { name: "TC Lyon" }, status: "OPEN", matchCount: 1 });
  });

  it("le rayon réglé à la main change le résultat", async () => {
    await clubWithEncounter("TC Lyon", { latitude: 45.75, longitude: 4.85 }, at(3));
    await clubWithEncounter("TC Villefranche", VILLEFRANCHE, at(1));
    await clubWithEncounter("TC Grenoble", GRENOBLE, at(2));
    await setMyRadius(me, 20);
    expect((await listNearbyEncounters(me, NOW))!.encounters.map((e) => e.club.name)).toEqual(["TC Lyon"]);
    await setMyRadius(me, 120);
    expect((await listNearbyEncounters(me, NOW))!.encounters.map((e) => e.club.name)).toEqual(["TC Villefranche", "TC Grenoble", "TC Lyon"]);
    await setMyRadius(me, 1);
    expect((await listNearbyEncounters(me, NOW))!.encounters).toEqual([]);
  });

  it("un club dans le coin du rectangle de recherche mais hors du cercle est exclu (le calcul exact compte)", async () => {
    // ~ 0,9 × 30 km vers le nord et vers l'est : dans le rectangle de 30 km, mais à ~ 38 km à vol d'oiseau.
    const corner = { latitude: LYON.latitude + (0.9 * 30) / 111.2, longitude: LYON.longitude + (0.9 * 30) / (111.2 * Math.cos((LYON.latitude * Math.PI) / 180)) };
    await clubWithEncounter("TC Coin", corner, at(2));
    const r = (await listNearbyEncounters(me, NOW))!;
    expect(r.encounters).toEqual([]);
    expect(r.clubsInRange).toBe(0);
    await setMyRadius(me, 40);
    expect((await listNearbyEncounters(me, NOW))!.encounters.map((e) => e.club.name)).toEqual(["TC Coin"]);
  });

  it("un club dont on n'est pas membre apparaît aussi ; devenir membre le signale", async () => {
    const lyon = await clubWithEncounter("TC Lyon", { latitude: 45.75, longitude: 4.85 }, at(3));
    expect((await listNearbyEncounters(me, NOW))!.encounters[0]!.isMember).toBe(false);
    await joinClub(me, lyon.clubId);
    expect((await listNearbyEncounters(me, NOW))!.encounters[0]!.isMember).toBe(true);
  });

  it("seules les rencontres publiées (pronostics ouverts) et pas encore commencées comptent : ni brouillon, ni annulée, ni terminée", async () => {
    const draft = await clubWithEncounter("TC Brouillon", { latitude: 45.76, longitude: 4.84 }, at(2), { publish: false });
    const cancelled = await clubWithEncounter("TC Annulé", { latitude: 45.76, longitude: 4.84 }, at(2));
    await db.encounter.update({ where: { id: cancelled.encounterId }, data: { status: "CANCELLED" } });
    const scored = await clubWithEncounter("TC Terminé", { latitude: 45.76, longitude: 4.84 }, at(2));
    await db.encounter.update({ where: { id: scored.encounterId }, data: { status: "CONFIRMED" } });
    const soon = await clubWithEncounter("TC Bientôt", { latitude: 45.76, longitude: 4.84 }, at(1));
    expect(draft.encounterId).toBeTruthy();
    expect((await listNearbyEncounters(me, NOW))!.encounters.map((e) => e.id)).toEqual([soon.encounterId]);
    // Une fois l'heure de début passée, la rencontre n'est plus « à venir ».
    expect((await listNearbyEncounters(me, at(1.5)))!.encounters).toEqual([]);
  });

  it("un club sans adresse localisée ne peut pas être placé : il n'apparaît pas", async () => {
    await clubWithEncounter("TC Sans adresse", null, at(2));
    const r = (await listNearbyEncounters(me, NOW))!;
    expect(r.encounters).toEqual([]);
    expect(r.clubsInRange).toBe(0);
  });

  it("la position et le rayon sont ceux de la personne : un autre compte voit ses propres résultats", async () => {
    await clubWithEncounter("TC Grenoble", GRENOBLE, at(2));
    const other = await makeUser("Isere");
    await setMyPostalCode(other, "38000", found("Grenoble", GRENOBLE));
    expect((await listNearbyEncounters(me, NOW))!.encounters).toEqual([]);
    expect((await listNearbyEncounters(other, NOW))!.encounters.map((e) => e.club.name)).toEqual(["TC Grenoble"]);
  });
});
