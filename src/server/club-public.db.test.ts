import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { makeUser } from "../../tests/db/factories";
import { joinClub } from "./club-directory";
import { getPublicClub, getPublicClubEncounters, getPublicPageSettings, setPublicPage } from "./club-public";
import { createClub } from "./clubs";
import { addMatch, createEncounter, publishEncounter } from "./encounters";
import { addNewPlayerToTeam, createExternalTeam, createTeam } from "./teams";

// Page publique d'un club : désactivée au départ, activée par un admin, adresse unique.

let admin: string, admin2: string, cap: string, member: string, clubId: string, other: string;

beforeEach(async () => {
  [admin, admin2, cap, member] = (await Promise.all(["Admin", "Admin2", "Cap", "Membre"].map(makeUser))) as [string, string, string, string];
  clubId = (await createClub(admin, "TC Démo-Lyon")).id;
  other = (await createClub(admin2, "TC Démo Lyon")).id; // même adresse de départ que le premier
  await joinClub(cap, clubId);
  await joinClub(member, clubId);
});

describe("activation", () => {
  it("la page est introuvable tant qu'elle n'est pas activée, même avec le bon nom", async () => {
    expect(await getPublicClub("tc-demo-lyon")).toBeNull();
    expect(await getPublicPageSettings(admin, clubId)).toEqual({ publicPage: false, slug: null });
  });

  it("l'activation crée l'adresse depuis le nom ; un autre club au même nom reçoit -2", async () => {
    expect(await setPublicPage(admin, clubId, true)).toEqual({ publicPage: true, slug: "tc-demo-lyon" });
    expect(await setPublicPage(admin2, other, true)).toEqual({ publicPage: true, slug: "tc-demo-lyon-2" });
    expect((await getPublicClub("tc-demo-lyon"))?.id).toBe(clubId);
  });

  it("désactiver garde l'adresse mais la page redevient introuvable ; réactiver la retrouve", async () => {
    await setPublicPage(admin, clubId, true);
    expect(await setPublicPage(admin, clubId, false)).toEqual({ publicPage: false, slug: "tc-demo-lyon" });
    expect(await getPublicClub("tc-demo-lyon")).toBeNull();
    expect((await setPublicPage(admin, clubId, true)).slug).toBe("tc-demo-lyon");
  });

  it("seul un admin du club peut activer, désactiver ou lire le réglage", async () => {
    for (const who of [member, cap, admin2]) {
      await expect(setPublicPage(who, clubId, true)).rejects.toThrow();
      await expect(getPublicPageSettings(who, clubId)).rejects.toThrow();
    }
    expect((await db.club.findUnique({ where: { id: clubId } }))?.publicPage).toBe(false);
  });
});

describe("adresse", () => {
  beforeEach(async () => {
    await setPublicPage(admin, clubId, true);
  });

  it("peut être changée ; l'ancienne ne marche plus", async () => {
    await setPublicPage(admin, clubId, true, "tennis-lyon-7");
    expect((await getPublicClub("tennis-lyon-7"))?.id).toBe(clubId);
    expect(await getPublicClub("tc-demo-lyon")).toBeNull();
  });

  it("refuse une adresse prise par un autre club (même désactivé) ou invalide", async () => {
    await setPublicPage(admin2, other, true);
    await expect(setPublicPage(admin, clubId, true, "tc-demo-lyon-2")).rejects.toThrow("déjà prise");
    await setPublicPage(admin2, other, false);
    await expect(setPublicPage(admin, clubId, true, "tc-demo-lyon-2")).rejects.toThrow("déjà prise");
    await expect(setPublicPage(admin, clubId, true, "Mauvaise Adresse")).rejects.toThrow();
    await expect(setPublicPage(admin, clubId, true, "api")).rejects.toThrow("réservée");
    expect((await getPublicPageSettings(admin, clubId)).slug).toBe("tc-demo-lyon");
  });

  it("la base refuse une page publique sans adresse", async () => {
    await expect(db.$executeRawUnsafe(`UPDATE "Club" SET "slug" = NULL WHERE id = '${clubId}'`)).rejects.toThrow();
  });
});

describe("contenu public", () => {
  it("ne montre ni description ni membre, mais les équipes ; rencontres : jamais de brouillon", async () => {
    await db.club.update({ where: { id: clubId }, data: { description: "Texte privé", city: "Lyon", licenseeCount: 250 } });
    const team = await createTeam(admin, clubId, { name: "Messieurs 1", captainUserId: cap });
    const ext = await createExternalTeam(admin, clubId, { name: "TC Voisin 1", externalClubName: "TC Voisin" });
    const a = await addNewPlayerToTeam(admin, team.id, { firstName: "Léa", lastName: "Martin", fftRank: "R30" });
    const b = await addNewPlayerToTeam(admin, ext.id, { firstName: "Paul", lastName: "Voisin", fftRank: "R30" });
    const T0 = new Date("2026-10-01T10:00:00Z");
    const draft = await createEncounter(cap, { clubTeamId: team.id, opponentTeamId: ext.id, clubTeamIsHome: true, startsAt: new Date("2026-11-01T12:00:00Z") }, T0);
    const live = await createEncounter(cap, { clubTeamId: team.id, opponentTeamId: ext.id, clubTeamIsHome: true, startsAt: new Date("2026-11-05T12:00:00Z") }, T0);
    await addMatch(cap, live.id, { homePlayerId: a.id, awayPlayerId: b.id }, T0);
    await publishEncounter(cap, live.id, T0);
    await setPublicPage(admin, clubId, true);

    const club = (await getPublicClub("tc-demo-lyon"))!;
    expect(JSON.stringify(club)).not.toContain("Texte privé");
    expect(club.teams.map((t) => t.name)).toEqual(["Messieurs 1"]);
    expect(club).toMatchObject({ city: "Lyon", licenseeCount: 250 });
    const { upcoming } = await getPublicClubEncounters(clubId);
    expect(upcoming.map((e) => e.id)).toEqual([live.id]);
    expect(upcoming.some((e) => e.id === draft.id)).toBe(false);
  });
});
