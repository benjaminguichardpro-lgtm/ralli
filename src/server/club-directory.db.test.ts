import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { makeEncounterWithPlayer, makeUser } from "../../tests/db/factories";
import { countFollowers, joinClub, leaveClub, searchClubs } from "./club-directory";
import { createClub, joinClubByCode, setMemberRole } from "./clubs";
import { listPublicClubEncounters } from "./encounters";
import { getClubProfile } from "./club-profile";
import { createTeam } from "./teams";

let admin: string, other: string, visitor: string, member: string;
let lyon: { id: string; inviteCode: string }, nantes: { id: string; inviteCode: string };

beforeEach(async () => {
  [admin, other, visitor, member] = (await Promise.all(["Admin", "Autre", "Visiteur", "Membre"].map(makeUser))) as [string, string, string, string];
  lyon = await createClub(admin, "TC Lyon Part-Dieu");
  nantes = await createClub(other, "Tennis Club Nantes");
  await db.club.update({ where: { id: lyon.id }, data: { city: "Lyon", postalCode: "69003" } });
  await db.club.update({ where: { id: nantes.id }, data: { city: "Nantes", postalCode: "44000" } });
  await joinClubByCode(member, lyon.inviteCode);
});

describe("recherche de clubs", () => {
  it("liste tous les clubs, les plus suivis d'abord, avec le compteur et le statut de membre", async () => {
    const all = await searchClubs(member);
    expect(all.map((c) => [c.name, c.followers, c.isMember])).toEqual([
      ["TC Lyon Part-Dieu", 2, true],
      ["Tennis Club Nantes", 1, false],
    ]);
  });

  it("trouve par nom, ville ou code postal, sans accents ni casse ; aucun résultat si rien ne correspond", async () => {
    expect((await searchClubs(visitor, "LYON")).map((c) => c.name)).toEqual(["TC Lyon Part-Dieu"]);
    expect((await searchClubs(visitor, "nantés")).map((c) => c.name)).toEqual(["Tennis Club Nantes"]);
    expect((await searchClubs(visitor, "440")).map((c) => c.name)).toEqual(["Tennis Club Nantes"]);
    expect((await searchClubs(visitor, "club")).map((c) => c.name).sort()).toEqual(["TC Lyon Part-Dieu", "Tennis Club Nantes"].sort().filter((n) => /club/i.test(n)));
    expect(await searchClubs(visitor, "marseille")).toEqual([]);
  });
});

describe("rejoindre un club d'un bouton", () => {
  it("n'importe quel compte rejoint, une seule fois ; le compteur suit", async () => {
    expect(await countFollowers(nantes.id)).toBe(1);
    await joinClub(visitor, nantes.id);
    expect(await countFollowers(nantes.id)).toBe(2);
    expect((await db.clubMembership.findUniqueOrThrow({ where: { userId_clubId: { userId: visitor, clubId: nantes.id } } })).role).toBe("MEMBER");
    await expect(joinClub(visitor, nantes.id)).rejects.toMatchObject({ code: "ALREADY_MEMBER" });
    await expect(joinClub(visitor, "inconnu")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("quitter un club", () => {
  it("un membre quitte ; ses pronostics restent", async () => {
    await leaveClub(member, lyon.id);
    expect(await countFollowers(lyon.id)).toBe(1);
    await expect(leaveClub(member, lyon.id)).rejects.toMatchObject({ code: "NOT_FOUND" }); // plus membre
  });

  it("le dernier admin ne peut pas partir, un admin de plus le permet", async () => {
    await expect(leaveClub(admin, lyon.id)).rejects.toMatchObject({ code: "CANNOT_LEAVE" });
    await setMemberRole(admin, lyon.id, member, "ADMIN");
    await leaveClub(admin, lyon.id);
    expect(await countFollowers(lyon.id)).toBe(1);
  });

  it("un capitaine ne peut pas partir tant qu'il l'est", async () => {
    await createTeam(admin, lyon.id, { name: "Messieurs 1", captainUserId: member });
    await expect(leaveClub(member, lyon.id)).rejects.toMatchObject({ code: "CANNOT_LEAVE" });
  });

  it("un joueur aligné dans une rencontre non réglée ne peut pas partir ; une fois réglée, sa fiche est déliée", async () => {
    const linked = await db.player.create({ data: { clubId: lyon.id, firstName: "Théo", lastName: "Martin", fftRank: "R30", userId: member } });
    const encounterId = await makeEncounterWithPlayer({ clubId: lyon.id, createdById: admin, playerId: linked.id, status: "OPEN" });
    await expect(leaveClub(member, lyon.id)).rejects.toMatchObject({ code: "CANNOT_LEAVE" });
    await db.encounter.update({ where: { id: encounterId }, data: { status: "CONFIRMED", settledAt: new Date() } });
    await leaveClub(member, lyon.id);
    expect((await db.player.findUniqueOrThrow({ where: { id: linked.id } })).userId).toBeNull();
    expect(await countFollowers(lyon.id)).toBe(1);
  });
});

describe("consulter sans être membre", () => {
  it("la fiche du club est lisible par tout compte connecté (sans rôle)", async () => {
    const p = await getClubProfile(visitor, lyon.id);
    expect(p.name).toBe("TC Lyon Part-Dieu");
    expect(p.myRole).toBeNull();
    await expect(getClubProfile(visitor, "inconnu")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("les rencontres visibles : jamais de brouillon, ni d'archive", async () => {
    const player = await db.player.create({ data: { clubId: lyon.id, firstName: "Théo", lastName: "Martin", fftRank: "R30" } });
    const make = (status: "DRAFT" | "OPEN") => makeEncounterWithPlayer({ clubId: lyon.id, createdById: admin, playerId: player.id, status });
    await make("DRAFT");
    expect(await listPublicClubEncounters(lyon.id)).toEqual({ upcoming: [], recent: [] });
    const open = await make("OPEN");
    const { upcoming } = await listPublicClubEncounters(lyon.id);
    expect(upcoming.map((e) => e.id)).toEqual([open]);
    await db.encounter.update({ where: { id: open }, data: { status: "CONFIRMED", archivedAt: new Date() } });
    expect(await listPublicClubEncounters(lyon.id)).toEqual({ upcoming: [], recent: [] });
  });
});
