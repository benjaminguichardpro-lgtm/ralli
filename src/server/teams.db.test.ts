import { beforeEach, describe, expect, it } from "vitest";
import type { FftRank } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { makeEncounterWithPlayer, makeUser } from "../../tests/db/factories";
import { joinClub } from "./club-directory";
import { createClub } from "./clubs";
import {
  addExistingPlayerToTeam,
  addNewPlayerToTeam,
  createExternalTeam,
  createTeam,
  deletePlayer,
  getTeamView,
  listClubTeams,
  removePlayerFromTeam,
  setPlayerAccount,
  setTeamCaptain,
  updatePlayer,
} from "./teams";

// Distribution des rôles :
// admin (admin du club), capA (capitaine de l'équipe A), capB (capitaine de l'équipe B),
// member (simple membre), outsider (membre d'un autre club seulement).
let admin: string, capA: string, capB: string, member: string, outsider: string;
let clubId: string;
let teamA: string, teamB: string;

const p = (firstName: string, lastName: string, fftRank: FftRank = "R30") => ({ firstName, lastName, fftRank });

beforeEach(async () => {
  [admin, capA, capB, member, outsider] = await Promise.all(["Admin", "CapA", "CapB", "Membre", "Dehors"].map(makeUser)) as [
    string, string, string, string, string,
  ];
  const club = await createClub(admin, "TC Ralli");
  clubId = club.id;
  for (const u of [capA, capB, member]) await joinClub(u, club.id);
  await createClub(outsider, "AS Voisins");
  teamA = (await createTeam(admin, clubId, { name: "Messieurs 1", captainUserId: capA })).id;
  teamB = (await createTeam(admin, clubId, { name: "Messieurs 2", captainUserId: capB })).id;
});

describe("création d'équipes", () => {
  it("seul l'admin crée une équipe du club", async () => {
    for (const actor of [capA, member]) {
      await expect(createTeam(actor, clubId, { name: "Dames 1", captainUserId: member })).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await expect(createTeam(outsider, clubId, { name: "Dames 1", captainUserId: member })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("le capitaine doit être membre du club", async () => {
    await expect(createTeam(admin, clubId, { name: "Dames 1", captainUserId: outsider })).rejects.toMatchObject({ code: "NOT_A_MEMBER" });
  });

  it("refuse un nom déjà pris dans le club (équipes externes comprises)", async () => {
    await expect(createTeam(admin, clubId, { name: "Messieurs 1", captainUserId: member })).rejects.toMatchObject({ code: "TEAM_NAME_TAKEN" });
    await createExternalTeam(capA, clubId, { name: "TCV 1", externalClubName: "TC Voisin" });
    await expect(createExternalTeam(admin, clubId, { name: "TCV 1", externalClubName: "TC Voisin" })).rejects.toMatchObject({ code: "TEAM_NAME_TAKEN" });
  });

  it("équipe externe : admin et capitaines oui, simple membre non", async () => {
    await expect(createExternalTeam(admin, clubId, { name: "Ext 1", externalClubName: "TC Voisin" })).resolves.toHaveProperty("id");
    await expect(createExternalTeam(capB, clubId, { name: "Ext 2", externalClubName: "TC Voisin" })).resolves.toHaveProperty("id");
    await expect(createExternalTeam(member, clubId, { name: "Ext 3", externalClubName: "TC Voisin" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createExternalTeam(outsider, clubId, { name: "Ext 4", externalClubName: "TC Voisin" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("changer de capitaine : admin seulement, parmi les membres", async () => {
    await expect(setTeamCaptain(capA, teamA, member)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await setTeamCaptain(admin, teamA, member);
    expect((await db.team.findUniqueOrThrow({ where: { id: teamA } })).captainId).toBe(member);
    await expect(setTeamCaptain(admin, teamA, outsider)).rejects.toMatchObject({ code: "NOT_A_MEMBER" });
  });
});

describe("gestion des effectifs", () => {
  it("admin et capitaine de l'équipe gèrent l'effectif ; capitaine d'une autre équipe et membre non", async () => {
    await expect(addNewPlayerToTeam(admin, teamA, p("Léa", "Martin"))).resolves.toHaveProperty("id");
    await expect(addNewPlayerToTeam(capA, teamA, p("Hugo", "Durand"))).resolves.toHaveProperty("id");
    await expect(addNewPlayerToTeam(capB, teamA, p("X", "Y"))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(addNewPlayerToTeam(member, teamA, p("X", "Y"))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(addNewPlayerToTeam(outsider, teamA, p("X", "Y"))).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("équipe externe : admin et tout capitaine du club gèrent l'effectif", async () => {
    const ext = (await createExternalTeam(admin, clubId, { name: "TCV 1", externalClubName: "TC Voisin" })).id;
    await expect(addNewPlayerToTeam(capB, ext, p("Paul", "Voisin"))).resolves.toHaveProperty("id");
    await expect(addNewPlayerToTeam(member, ext, p("X", "Y"))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("un joueur peut être dans plusieurs équipes du club", async () => {
    const { id } = await addNewPlayerToTeam(capA, teamA, p("Léa", "Martin"));
    await addExistingPlayerToTeam(capB, teamB, id);
    const teams = await db.teamPlayer.findMany({ where: { playerId: id } });
    expect(teams).toHaveLength(2);
    await expect(addExistingPlayerToTeam(capB, teamB, id)).rejects.toMatchObject({ code: "ALREADY_IN_TEAM" });
  });

  it("on ne peut pas ajouter un joueur externe à une équipe du club, ni un joueur d'un autre club", async () => {
    const ext = (await createExternalTeam(admin, clubId, { name: "TCV 1", externalClubName: "TC Voisin" })).id;
    const extPlayer = await addNewPlayerToTeam(admin, ext, p("Paul", "Voisin"));
    await expect(addExistingPlayerToTeam(admin, teamA, extPlayer.id)).rejects.toMatchObject({ code: "NOT_FOUND" });

    const other = await db.club.findFirstOrThrow({ where: { name: "AS Voisins" } });
    const otherTeam = (await createTeam(outsider, other.id, { name: "Eq", captainUserId: outsider })).id;
    const foreign = await addNewPlayerToTeam(outsider, otherTeam, p("Zoé", "Ailleurs"));
    await expect(addExistingPlayerToTeam(admin, teamA, foreign.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("retirer un joueur de l'équipe garde sa fiche", async () => {
    const { id } = await addNewPlayerToTeam(capA, teamA, p("Léa", "Martin"));
    await expect(removePlayerFromTeam(capB, teamA, id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await removePlayerFromTeam(capA, teamA, id);
    expect(await db.teamPlayer.count({ where: { playerId: id } })).toBe(0);
    expect(await db.player.count({ where: { id } })).toBe(1);
  });

  it("modifier le niveau FFT : gestionnaire d'une de ses équipes seulement", async () => {
    const { id } = await addNewPlayerToTeam(capA, teamA, p("Léa", "Martin"));
    await updatePlayer(capA, id, p("Léa", "Martin", "R15_1"));
    expect((await db.player.findUniqueOrThrow({ where: { id } })).fftRank).toBe("R15_1");
    await expect(updatePlayer(capB, id, p("Léa", "Martin"))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updatePlayer(member, id, p("Léa", "Martin"))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await updatePlayer(admin, id, p("Léa", "Martin"));
  });

  it("supprimer une fiche : seulement si jamais alignée dans un match", async () => {
    const free = await addNewPlayerToTeam(capA, teamA, p("Léa", "Martin"));
    await deletePlayer(capA, free.id);
    expect(await db.player.count({ where: { id: free.id } })).toBe(0);

    const played = await addNewPlayerToTeam(capA, teamA, p("Hugo", "Durand"));
    await makeEncounterWithPlayer({ clubId, createdById: admin, playerId: played.id, status: "CONFIRMED", settled: true });
    await expect(deletePlayer(admin, played.id)).rejects.toMatchObject({ code: "PLAYER_HAS_MATCHES" });
  });
});

describe("lien fiche joueur ↔ compte", () => {
  it("le capitaine lie un membre ; un membre ne peut pas se lier lui-même", async () => {
    const { id } = await addNewPlayerToTeam(capA, teamA, p("Léa", "Martin"));
    await expect(setPlayerAccount(member, id, member)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await setPlayerAccount(capA, id, member);
    expect((await db.player.findUniqueOrThrow({ where: { id } })).userId).toBe(member);
  });

  it("refuse un compte non membre du club, ou déjà lié à une autre fiche", async () => {
    const a = await addNewPlayerToTeam(capA, teamA, p("Léa", "Martin"));
    const b = await addNewPlayerToTeam(capA, teamA, p("Hugo", "Durand"));
    await expect(setPlayerAccount(capA, a.id, outsider)).rejects.toMatchObject({ code: "NOT_A_MEMBER" });
    await setPlayerAccount(capA, a.id, member);
    await expect(setPlayerAccount(capA, b.id, member)).rejects.toMatchObject({ code: "ALREADY_LINKED" });
  });

  it("refuse de lier un joueur d'une équipe externe", async () => {
    const ext = (await createExternalTeam(admin, clubId, { name: "TCV 1", externalClubName: "TC Voisin" })).id;
    const extPlayer = await addNewPlayerToTeam(admin, ext, p("Paul", "Voisin"));
    await expect(setPlayerAccount(admin, extPlayer.id, member)).rejects.toMatchObject({ code: "INVALID" });
  });

  it.each(["OPEN", "SCORE_PROPOSED"] as const)("lier ET délier sont refusés pendant une rencontre %s non réglée", async (status) => {
    const linked = await addNewPlayerToTeam(capA, teamA, p("Léa", "Martin"));
    await setPlayerAccount(capA, linked.id, capB);
    const unlinked = await addNewPlayerToTeam(capA, teamA, p("Hugo", "Durand"));
    await makeEncounterWithPlayer({ clubId, createdById: admin, playerId: linked.id, status });
    await makeEncounterWithPlayer({ clubId, createdById: admin, playerId: unlinked.id, status });

    await expect(setPlayerAccount(capA, unlinked.id, member)).rejects.toMatchObject({ code: "PLAYER_LOCKED" });
    await expect(setPlayerAccount(capA, linked.id, null)).rejects.toMatchObject({ code: "PLAYER_LOCKED" });
  });

  it.each(["DRAFT", "CONFIRMED", "CANCELLED"] as const)("autorisé quand la rencontre est %s", async (status) => {
    const { id } = await addNewPlayerToTeam(capA, teamA, p("Léa", "Martin"));
    await makeEncounterWithPlayer({ clubId, createdById: admin, playerId: id, status, settled: status === "CONFIRMED" });
    await setPlayerAccount(capA, id, member);
    await setPlayerAccount(capA, id, null);
    expect((await db.player.findUniqueOrThrow({ where: { id } })).userId).toBeNull();
  });
});

describe("lecture", () => {
  it("tous les membres voient les équipes ; un non-membre non", async () => {
    await addNewPlayerToTeam(capA, teamA, p("Léa", "Martin"));
    const teams = await listClubTeams(member, clubId);
    expect(teams.map((t) => [t.name, t.captain?.displayName, t.playerCount])).toEqual([
      ["Messieurs 1", "CapA", 1],
      ["Messieurs 2", "CapB", 0],
    ]);
    await expect(listClubTeams(outsider, clubId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getTeamView(outsider, teamA)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("la vue équipe n'expose les listes de gestion qu'aux gestionnaires", async () => {
    const lea = await addNewPlayerToTeam(capA, teamA, p("Léa", "Martin"));
    await addNewPlayerToTeam(capB, teamB, p("Hugo", "Durand"));

    const asMember = await getTeamView(member, teamA);
    expect(asMember.canManage).toBe(false);
    expect(asMember.members).toEqual([]);
    expect(asMember.addablePlayers).toEqual([]);
    expect(asMember.players.map((x) => x.id)).toEqual([lea.id]);

    const asCaptain = await getTeamView(capA, teamA);
    expect(asCaptain.canManage).toBe(true);
    expect(asCaptain.addablePlayers.map((x) => x.lastName)).toEqual(["Durand"]);
    expect(asCaptain.members.length).toBe(4);
    expect(JSON.stringify(asCaptain)).not.toContain("@club.fr");

    expect((await getTeamView(capB, teamA)).canManage).toBe(false);
  });
});
