import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { makeUser } from "../../tests/db/factories";
import { joinClub, searchClubs } from "./club-directory";
import { deleteClub } from "./club-delete";
import { getPublicClub, setPublicPage } from "./club-public";
import { createClub, getClubView } from "./clubs";
import { addMatch, createEncounter, getEncounterPage, publishEncounter } from "./encounters";
import { getBalance } from "./ledger";
import { addNewPlayerToTeam, createExternalTeam, createTeam } from "./teams";

// Suppression d'un club : douce, réservée aux admins, avec confirmation « SUPPRIMER », pronostics en cours remboursés.

const T0 = new Date("2026-10-01T10:00:00Z");
const START = new Date("2026-11-05T12:00:00Z");
let admin: string, admin2: string, cap: string, member: string, punter: string, clubId: string, matchId: string, encId: string, draftId: string;

beforeEach(async () => {
  [admin, admin2, cap, member, punter] = (await Promise.all(["Admin", "Admin2", "Cap", "Membre", "Parieur"].map(makeUser))) as [string, string, string, string, string];
  clubId = (await createClub(admin, "TC Suppression")).id;
  for (const u of [cap, member, punter]) await joinClub(u, clubId);
  const team = await createTeam(admin, clubId, { name: "Messieurs 1", captainUserId: cap });
  const ext = await createExternalTeam(admin, clubId, { name: "TC Voisin 1", externalClubName: "TC Voisin" });
  const a = await addNewPlayerToTeam(admin, team.id, { firstName: "Léa", lastName: "Martin", fftRank: "R30" });
  const b = await addNewPlayerToTeam(admin, ext.id, { firstName: "Paul", lastName: "Voisin", fftRank: "R30" });
  encId = (await createEncounter(cap, { clubTeamId: team.id, opponentTeamId: ext.id, clubTeamIsHome: true, startsAt: START }, T0)).id;
  matchId = (await addMatch(cap, encId, { homePlayerId: a.id, awayPlayerId: b.id }, T0)).id;
  await publishEncounter(cap, encId, T0);
  draftId = (await createEncounter(cap, { clubTeamId: team.id, opponentTeamId: ext.id, clubTeamIsHome: false, startsAt: new Date("2026-11-20T12:00:00Z") }, T0)).id;
});

describe("deleteClub", () => {
  it("refuse tout sauf « SUPPRIMER » exact, et tout non-admin ; rien ne change", async () => {
    for (const word of ["", "supprimer", "SUPPRIMER ", "Supprimer"]) await expect(deleteClub(admin, clubId, word, T0)).rejects.toThrow("SUPPRIMER");
    for (const who of [cap, member, punter, admin2]) await expect(deleteClub(who, clubId, "SUPPRIMER", T0)).rejects.toThrow();
    expect((await db.club.findUniqueOrThrow({ where: { id: clubId } })).deletedAt).toBeNull();
    expect(await db.clubMembership.count({ where: { clubId } })).toBe(4);
  });

  it("annule les rencontres, rembourse les pronostics en cours, retire les adhésions et garde la liste des membres", async () => {
    const pr = await db.prediction.create({ data: { userId: punter, matchId, pickedSide: "HOME", committedAces: 100, oddsX100: 150 } });
    await db.ledgerEntry.create({ data: { userId: punter, type: "PREDICTION_COMMIT", amount: -100, predictionId: pr.id, idempotencyKey: `commit:${pr.id}` } });
    const before = await getBalance(punter);

    expect(await deleteClub(admin, clubId, "SUPPRIMER", T0)).toEqual({ refunded: 1 });
    expect(await getBalance(punter)).toBe(before + 100);
    expect(await db.prediction.findUniqueOrThrow({ where: { id: pr.id } })).toMatchObject({ status: "REFUNDED", payoutAces: 100 });
    expect((await db.encounter.findMany({ where: { organizerClubId: clubId }, select: { status: true } })).map((e) => e.status)).toEqual(["CANCELLED", "CANCELLED"]);
    expect(await db.encounterEvent.count({ where: { encounterId: { in: [encId, draftId] }, note: "Club supprimé" } })).toBe(2);

    const club = await db.club.findUniqueOrThrow({ where: { id: clubId } });
    expect(club).toMatchObject({ deletedById: admin, publicPage: false, slug: null });
    expect(club.deletedAt).toEqual(T0);
    expect(await db.clubMembership.count({ where: { clubId } })).toBe(0);
    expect((club.deletedMembership as { userId: string; role: string }[]).find((m) => m.userId === admin)?.role).toBe("ADMIN");
    expect((club.deletedMembership as unknown[]).length).toBe(4);
  });

  it("le club disparaît : recherche, page du club, rencontre, adhésion, page publique ; sa page ne se supprime pas deux fois", async () => {
    await setPublicPage(admin, clubId, true);
    await deleteClub(admin, clubId, "SUPPRIMER", T0);
    expect((await searchClubs(punter, "Suppression")).length).toBe(0);
    await expect(getClubView(admin, clubId)).rejects.toThrow();
    await expect(getEncounterPage(null, encId, T0)).rejects.toThrow();
    await expect(joinClub(member, clubId)).rejects.toThrow();
    expect(await getPublicClub("tc-suppression")).toBeNull();
    await expect(deleteClub(admin, clubId, "SUPPRIMER", T0)).rejects.toThrow();
  });

  it("l'adresse de la page et le nom redeviennent libres pour un autre club", async () => {
    await setPublicPage(admin, clubId, true);
    await deleteClub(admin, clubId, "SUPPRIMER", T0);
    const again = (await createClub(admin2, "TC Suppression")).id;
    expect(await setPublicPage(admin2, again, true)).toEqual({ publicPage: true, slug: "tc-suppression" });
  });

  it("un autre club n'est pas touché", async () => {
    const other = (await createClub(admin2, "TC Autre")).id;
    await deleteClub(admin, clubId, "SUPPRIMER", T0);
    expect((await searchClubs(admin2, "Autre")).map((c) => c.id)).toEqual([other]);
    expect(await db.clubMembership.count({ where: { clubId: other } })).toBe(1);
  });
});
