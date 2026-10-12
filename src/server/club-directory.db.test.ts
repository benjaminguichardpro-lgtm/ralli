import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { makeEncounterWithPlayer, makeUser } from "../../tests/db/factories";
import { countFollowers, decideReturn, getMyRemoval, joinClub, leaveClub, listReturnRequests, removeMember, requestReturn, searchClubs } from "./club-directory";
import { createClub, getClubView, listMyClubs, setMemberRole } from "./clubs";
import { listPublicClubEncounters } from "./encounters";
import { getClubProfile } from "./club-profile";
import { createTeam } from "./teams";

let admin: string, other: string, visitor: string, member: string;
let lyon: { id: string }, nantes: { id: string };

beforeEach(async () => {
  [admin, other, visitor, member] = (await Promise.all(["Admin", "Autre", "Visiteur", "Membre"].map(makeUser))) as [string, string, string, string];
  lyon = await createClub(admin, "TC Lyon Part-Dieu");
  nantes = await createClub(other, "Tennis Club Nantes");
  await db.club.update({ where: { id: lyon.id }, data: { city: "Lyon", postalCode: "69003" } });
  await db.club.update({ where: { id: nantes.id }, data: { city: "Nantes", postalCode: "44000" } });
  await joinClub(member, lyon.id);
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

describe("retirer un membre (tranche 30)", () => {
  it("un admin retire un membre : il n'est plus membre, ne compte plus parmi les suiveurs, ne rejoint plus d'un clic", async () => {
    await removeMember(admin, lyon.id, member);
    expect(await listMyClubs(member)).toEqual([]);
    expect(await countFollowers(lyon.id)).toBe(1);
    expect((await getClubView(admin, lyon.id)).members.map((m) => m.displayName)).toEqual(["Admin"]);
    await expect(joinClub(member, lyon.id)).rejects.toMatchObject({ code: "REMOVED_FROM_CLUB" });
    expect(await getMyRemoval(member, lyon.id)).toEqual({ requestedAt: null });
  });

  it("seuls les admins du club peuvent retirer : membre, non-membre, admin d'un autre club refusés", async () => {
    await expect(removeMember(member, lyon.id, member)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(removeMember(visitor, lyon.id, member)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(removeMember(other, lyon.id, member)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await listMyClubs(member)).length).toBe(1);
  });

  it("refuse de se retirer soi-même, de retirer un admin ou un non-membre", async () => {
    await expect(removeMember(admin, lyon.id, admin)).rejects.toMatchObject({ code: "CANNOT_REMOVE" });
    await setMemberRole(admin, lyon.id, member, "ADMIN");
    await expect(removeMember(admin, lyon.id, member)).rejects.toMatchObject({ code: "CANNOT_REMOVE" });
    await expect(removeMember(admin, lyon.id, visitor)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuse de retirer un capitaine d'équipe, tant qu'une équipe l'a pour capitaine", async () => {
    const team = await createTeam(admin, lyon.id, { name: "Messieurs 1", captainUserId: member });
    await expect(removeMember(admin, lyon.id, member)).rejects.toMatchObject({ code: "CANNOT_REMOVE", message: expect.stringContaining("Messieurs 1") });
    await db.team.update({ where: { id: team.id }, data: { captainId: admin } });
    await removeMember(admin, lyon.id, member);
    expect(await listMyClubs(member)).toEqual([]);
  });

  it("le lien avec la fiche de joueur reste en place", async () => {
    const player = await db.player.create({ data: { clubId: lyon.id, firstName: "Max", lastName: "Dupont", fftRank: "R30_5", userId: member } });
    await removeMember(admin, lyon.id, member);
    expect((await db.player.findUniqueOrThrow({ where: { id: player.id } })).userId).toBe(member);
  });

  it("quitter soi-même n'empêche pas de revenir d'un clic", async () => {
    await leaveClub(member, lyon.id);
    expect(await getMyRemoval(member, lyon.id)).toBeNull();
    await joinClub(member, lyon.id);
    expect((await listMyClubs(member)).length).toBe(1);
  });
});

describe("demander à revenir (tranche 30)", () => {
  beforeEach(async () => {
    await removeMember(admin, lyon.id, member);
  });

  it("une seule demande en attente à la fois, visible des admins seulement", async () => {
    await requestReturn(member, lyon.id);
    await expect(requestReturn(member, lyon.id)).rejects.toMatchObject({ code: "REQUEST_PENDING" });
    expect((await listReturnRequests(admin, lyon.id)).map((r) => r.displayName)).toEqual(["Membre"]);
    await expect(listReturnRequests(visitor, lyon.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(listReturnRequests(other, lyon.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("seule une personne retirée peut demander", async () => {
    await expect(requestReturn(visitor, lyon.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("accepter : la personne redevient membre simple et la marque disparaît", async () => {
    await requestReturn(member, lyon.id);
    await decideReturn(admin, lyon.id, member, true);
    expect(await listMyClubs(member)).toMatchObject([{ id: lyon.id, role: "MEMBER" }]);
    expect(await getMyRemoval(member, lyon.id)).toBeNull();
    expect(await listReturnRequests(admin, lyon.id)).toEqual([]);
  });

  it("refuser : elle reste retirée, la demande disparaît et elle peut redemander", async () => {
    await requestReturn(member, lyon.id);
    await decideReturn(admin, lyon.id, member, false);
    expect(await listMyClubs(member)).toEqual([]);
    expect(await getMyRemoval(member, lyon.id)).toEqual({ requestedAt: null });
    expect(await listReturnRequests(admin, lyon.id)).toEqual([]);
    await requestReturn(member, lyon.id);
    expect((await listReturnRequests(admin, lyon.id)).length).toBe(1);
  });

  it("seuls les admins du club décident, et seulement s'il y a une demande en attente", async () => {
    await requestReturn(member, lyon.id);
    await expect(decideReturn(visitor, lyon.id, member, true)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(decideReturn(other, lyon.id, member, true)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(decideReturn(admin, lyon.id, visitor, true)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await listMyClubs(member)).toEqual([]);
  });

  it("retirer de nouveau efface une demande en attente", async () => {
    await requestReturn(member, lyon.id);
    await decideReturn(admin, lyon.id, member, true);
    await removeMember(admin, lyon.id, member);
    expect(await getMyRemoval(member, lyon.id)).toEqual({ requestedAt: null });
  });
});
