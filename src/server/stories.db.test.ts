import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { makeUser } from "../../tests/db/factories";
import { createClub, joinClubByCode } from "./clubs";
import { createTeam } from "./teams";
import { addStoryToWall, createStory, deleteCollection, deleteStory, listClubWall, listPublishTargets, listStoryRings, markStoryViewed, removeStoryFromWall, setCollectionPinned } from "./stories";

// admin (admin du club), capA (capitaine de l'équipe A), capB, member (simple membre), outsider (autre club seulement).
let admin: string, capA: string, capB: string, member: string, outsider: string;
let clubId: string, teamA: string, teamB: string;

const base = (over: Partial<Parameters<typeof createStory>[1]> = {}) => ({ clubId, teamId: null, body: "Rendez-vous samedi 13 h", background: "brand", onWall: false, collectionName: null, ...over });
const T0 = new Date("2026-10-12T10:00:00Z");
const hours = (h: number) => new Date(T0.getTime() + h * 3600_000);

beforeEach(async () => {
  [admin, capA, capB, member, outsider] = (await Promise.all(["Admin", "CapA", "CapB", "Membre", "Dehors"].map(makeUser))) as [string, string, string, string, string];
  const club = await createClub(admin, "TC Ralli");
  clubId = club.id;
  for (const u of [capA, capB, member]) await joinClubByCode(u, club.inviteCode);
  await createClub(outsider, "AS Voisins");
  teamA = (await createTeam(admin, clubId, { name: "Messieurs 1", captainUserId: capA })).id;
  teamB = (await createTeam(admin, clubId, { name: "Messieurs 2", captainUserId: capB })).id;
});

describe("publication", () => {
  it("un admin publie pour tout le club, avec ou sans la une", async () => {
    const { id } = await createStory(admin, base({ onWall: true, collectionName: "Infos" }), T0);
    const s = await db.story.findUniqueOrThrow({ where: { id } });
    expect(s.teamId).toBeNull();
    expect(s.collectionId).not.toBeNull();
    expect(s.expiresAt.getTime() - s.createdAt.getTime()).toBe(24 * 3600_000);
  });

  it("un capitaine publie pour son équipe seulement, jamais à la une ni pour tout le club", async () => {
    const { id } = await createStory(capA, base({ teamId: teamA, onWall: true, collectionName: "Infos" }), T0);
    const s = await db.story.findUniqueOrThrow({ where: { id } });
    expect(s.teamId).toBe(teamA);
    expect(s.collectionId).toBeNull();
    await expect(createStory(capA, base({ teamId: teamB }), T0)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createStory(capA, base(), T0)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("un simple membre ne publie pas, un étranger au club non plus", async () => {
    await expect(createStory(member, base({ teamId: teamA }), T0)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createStory(member, base(), T0)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createStory(outsider, base(), T0)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("texte vide, trop long, mot interdit ou fond inconnu refusés", async () => {
    for (const over of [{ body: "  " }, { body: "x".repeat(281) }, { body: "Faites vos paris" }, { background: "rose" }]) {
      await expect(createStory(admin, base(over), T0)).rejects.toMatchObject({ code: "STORY_INVALID" });
    }
    expect(await db.story.count()).toBe(0);
  });

  it("qui peut publier où", async () => {
    expect(await listPublishTargets(admin)).toEqual([{ clubId, clubName: "TC Ralli", isAdmin: true, teams: [], collections: [] }]);
    expect(await listPublishTargets(capA)).toEqual([{ clubId, clubName: "TC Ralli", isAdmin: false, teams: [{ id: teamA, name: "Messieurs 1" }], collections: [] }]);
    expect(await listPublishTargets(member)).toEqual([]);
  });
});

describe("bandeau et vues", () => {
  it("seuls les membres voient les stories, pendant 24 h", async () => {
    await createStory(admin, base(), T0);
    expect(await listStoryRings(member, { now: hours(1) })).toHaveLength(1);
    expect(await listStoryRings(outsider, { now: hours(1) })).toHaveLength(0);
    expect(await listStoryRings(member, { now: hours(23.9) })).toHaveLength(1);
    expect(await listStoryRings(member, { now: hours(24) })).toHaveLength(0);
  });

  it("un rond pour le club, un par équipe ; non vues d'abord", async () => {
    await createStory(capA, base({ teamId: teamA, body: "Équipe 1" }), hours(0));
    await createStory(admin, base({ body: "Club" }), hours(1));
    const rings = await listStoryRings(member, { now: hours(2) });
    expect(rings.map((r) => r.teamName)).toEqual([null, "Messieurs 1"]);
    const clubStory = rings[0]!.stories[0]!;
    await markStoryViewed(member, clubStory.id, hours(2));
    const after = await listStoryRings(member, { now: hours(3) });
    expect(after.map((r) => r.teamName)).toEqual(["Messieurs 1", null]);
    expect(after[1]!.unseen).toBe(0);
  });

  it("vue : idempotente, ignorée pour un étranger ou une story expirée ; le compteur n'est visible que de l'auteur et des admins", async () => {
    const { id } = await createStory(capA, base({ teamId: teamA }), T0);
    await markStoryViewed(member, id, hours(1));
    await markStoryViewed(member, id, hours(1));
    await markStoryViewed(outsider, id, hours(1));
    await markStoryViewed(capB, id, hours(25));
    expect(await db.storyView.count({ where: { storyId: id } })).toBe(1);
    const count = async (u: string) => (await listStoryRings(u, { now: hours(2) }))[0]!.stories[0]!.viewCount;
    expect(await count(admin)).toBe(1);
    expect(await count(capA)).toBe(1);
    expect(await count(member)).toBeNull();
    expect(await count(capB)).toBeNull();
  });

  it("restreint à un club", async () => {
    await createStory(admin, base(), T0);
    expect(await listStoryRings(member, { clubId: "autre", now: hours(1) })).toHaveLength(0);
    expect(await listStoryRings(member, { clubId, now: hours(1) })).toHaveLength(1);
  });
});

describe("suppression", () => {
  it("l'auteur ou un admin supprime ; un autre membre non ; la trace reste", async () => {
    const { id } = await createStory(capA, base({ teamId: teamA }), T0);
    await expect(deleteStory(member, id, hours(1))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(deleteStory(capB, id, hours(1))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(deleteStory(outsider, id, hours(1))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await deleteStory(admin, id, hours(1));
    const s = await db.story.findUniqueOrThrow({ where: { id } });
    expect(s.deletedById).toBe(admin);
    expect(await listStoryRings(member, { now: hours(2) })).toHaveLength(0);
    const mine = await createStory(capA, base({ teamId: teamA }), T0);
    await deleteStory(capA, mine.id, hours(1));
    expect(await listStoryRings(member, { now: hours(2) })).toHaveLength(0);
  });
});

describe("« à la une » du club : collections nommées", () => {
  const wallStory = (body: string, name: string, at = T0) => createStory(admin, base({ body, onWall: true, collectionName: name }), at);

  it("regroupe les stories par nom (sans tenir compte de la casse), garde après 24 h, membres seulement", async () => {
    const a = await wallStory("Tournoi 1", "Tournoi d'été", hours(0));
    const b = await wallStory("Tournoi 2", "TOURNOI D'ÉTÉ", hours(2));
    await wallStory("Infos", "Infos de la saison", hours(3));
    await createStory(admin, base({ body: "Pas à la une" }), hours(4));
    const wall = await listClubWall(member, clubId);
    expect(wall.isAdmin).toBe(false);
    expect(wall.collections.map((c) => c.name)).toEqual(["Infos de la saison", "Tournoi d'été"]); // la plus récente d'abord
    const tournoi = wall.collections[1]!;
    expect(tournoi.stories.map((s) => s.body)).toEqual(["Tournoi 1", "Tournoi 2"]); // de la plus ancienne à la plus récente
    expect(tournoi.stories.every((s) => s.collection?.id === tournoi.id)).toBe(true);
    expect(await db.storyCollection.count()).toBe(2);
    // Les stories ont expiré (plus de 24 h) : elles restent à la une.
    expect(await listStoryRings(member, { now: hours(100) })).toHaveLength(0);
    expect((await listClubWall(member, clubId)).collections).toHaveLength(2);
    await expect(listClubWall(outsider, clubId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(a.id).not.toBe(b.id);
  });

  it("épingler une collection : admins seulement, une seule à la fois, elle passe en premier", async () => {
    await wallStory("A", "Alpha", hours(0));
    await wallStory("B", "Beta", hours(1));
    const [beta, alpha] = (await listClubWall(admin, clubId)).collections;
    expect([beta!.name, alpha!.name]).toEqual(["Beta", "Alpha"]);
    await expect(setCollectionPinned(member, alpha!.id, true)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setCollectionPinned(outsider, alpha!.id, true)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await setCollectionPinned(admin, alpha!.id, true);
    expect((await listClubWall(admin, clubId)).collections.map((c) => c.name)).toEqual(["Alpha", "Beta"]);
    await setCollectionPinned(admin, beta!.id, true);
    expect(await db.storyCollection.count({ where: { pinnedAt: { not: null } } })).toBe(1);
    expect((await listClubWall(admin, clubId)).collections[0]!.name).toBe("Beta");
    await setCollectionPinned(admin, beta!.id, false);
    expect(await db.storyCollection.count({ where: { pinnedAt: { not: null } } })).toBe(0);
  });

  it("supprimer la dernière story d'une collection la fait disparaître, supprimer la collection garde les stories", async () => {
    const a = await wallStory("A", "Alpha", hours(0));
    const b = await wallStory("B", "Alpha", hours(1));
    await deleteStory(admin, a.id, hours(2));
    expect((await listClubWall(admin, clubId)).collections[0]!.stories).toHaveLength(1);
    await deleteStory(admin, b.id, hours(3));
    expect((await listClubWall(admin, clubId)).collections).toHaveLength(0);
    expect(await db.storyCollection.count()).toBe(0);

    const c = await wallStory("C", "Gamma", hours(4));
    const col = (await listClubWall(admin, clubId)).collections[0]!;
    await expect(deleteCollection(member, col.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await deleteCollection(admin, col.id);
    expect((await listClubWall(admin, clubId)).collections).toHaveLength(0);
    const s = await db.story.findUniqueOrThrow({ where: { id: c.id } });
    expect([s.collectionId, s.deletedAt]).toEqual([null, null]); // la story existe toujours
    expect(await listStoryRings(member, { now: hours(5) })).toHaveLength(1);
  });
});

describe("ajout à la une depuis une story", () => {
  it("publier à la une exige une collection : nom de 1 à 40 caractères sans mot interdit, ou collection existante du club", async () => {
    for (const collectionName of [null, "  ", "x".repeat(41), "Nos paris"]) {
      await expect(createStory(admin, base({ onWall: true, collectionName }), T0)).rejects.toMatchObject({ code: "STORY_INVALID" });
    }
    await expect(createStory(admin, base({ onWall: true, collectionId: "inconnue" }), T0)).rejects.toMatchObject({ code: "STORY_INVALID" });
    const { id } = await createStory(admin, base({ onWall: true, collectionName: "  Tournoi d'été " }), T0);
    expect((await listClubWall(admin, clubId)).collections[0]!.name).toBe("Tournoi d'été");
    const col = (await db.story.findUniqueOrThrow({ where: { id } })).collectionId!;
    const again = await createStory(admin, base({ body: "Suite", onWall: true, collectionId: col }), hours(1));
    expect((await db.story.findUniqueOrThrow({ where: { id: again.id } })).collectionId).toBe(col);
    // Une collection d'un autre club est refusée.
    const other = await createClub(outsider, "AS Voisins 2");
    expect(other.id).not.toBe(clubId);
    const foreign = await db.storyCollection.create({ data: { clubId: other.id, name: "Autre", nameKey: "autre" } });
    await expect(createStory(admin, base({ onWall: true, collectionId: foreign.id }), T0)).rejects.toMatchObject({ code: "STORY_INVALID" });
  });

  it("un admin ajoute une story vivante à une collection (nouvelle ou existante), puis l'en retire", async () => {
    const { id } = await createStory(capA, base({ teamId: teamA }), T0);
    await expect(addStoryToWall(admin, id, { collectionName: "" }, hours(1))).rejects.toMatchObject({ code: "STORY_INVALID" });
    await addStoryToWall(admin, id, { collectionName: "Tournoi d'été" }, hours(1));
    expect((await listClubWall(member, clubId)).collections.map((c) => c.name)).toEqual(["Tournoi d'été"]);
    expect((await listPublishTargets(admin))[0]!.collections.map((c) => c.name)).toEqual(["Tournoi d'été"]);
    const second = await createStory(admin, base({ body: "Deuxième" }), hours(2));
    const col = (await db.story.findUniqueOrThrow({ where: { id } })).collectionId!;
    await addStoryToWall(admin, second.id, { collectionId: col }, hours(3));
    expect((await listClubWall(admin, clubId)).collections[0]!.stories).toHaveLength(2);
    await removeStoryFromWall(admin, id);
    expect((await listClubWall(admin, clubId)).collections[0]!.stories).toHaveLength(1);
    await removeStoryFromWall(admin, second.id);
    expect((await listClubWall(admin, clubId)).collections).toHaveLength(0);
    expect(await db.storyCollection.count()).toBe(0);
    expect(await listStoryRings(member, { now: hours(4) })).toHaveLength(2); // les stories restent visibles 24 h
  });

  it("réservé aux admins ; refusé pour une story expirée ou supprimée", async () => {
    const { id } = await createStory(capA, base({ teamId: teamA }), T0);
    for (const actor of [capA, member]) {
      await expect(addStoryToWall(actor, id, { collectionName: "Infos" }, hours(1))).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(removeStoryFromWall(actor, id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await expect(addStoryToWall(outsider, id, { collectionName: "Infos" }, hours(1))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(addStoryToWall(admin, id, { collectionName: "Infos" }, hours(24))).rejects.toMatchObject({ code: "STORY_INVALID" });
    await deleteStory(admin, id, hours(2));
    await expect(addStoryToWall(admin, id, { collectionName: "Infos" }, hours(3))).rejects.toMatchObject({ code: "STORY_INVALID" });
  });

  it("le bouton n'est proposé qu'aux admins (canManageWall)", async () => {
    await createStory(capA, base({ teamId: teamA }), T0);
    const can = async (u: string) => (await listStoryRings(u, { now: hours(1) }))[0]!.stories[0]!.canManageWall;
    expect(await can(admin)).toBe(true);
    expect(await can(capA)).toBe(false);
    expect(await can(member)).toBe(false);
  });
});

describe("garde-fous en base", () => {
  it("refuse deux collections épinglées dans un club, un nom vide ou en double", async () => {
    await db.storyCollection.create({ data: { clubId, name: "A", nameKey: "a", pinnedAt: T0 } });
    await expect(db.storyCollection.create({ data: { clubId, name: "B", nameKey: "b", pinnedAt: T0 } })).rejects.toThrow();
    await expect(db.storyCollection.create({ data: { clubId, name: "", nameKey: "" } })).rejects.toThrow();
    await expect(db.storyCollection.create({ data: { clubId, name: "a", nameKey: "a" } })).rejects.toThrow();
    const data = { clubId, authorId: admin, background: "brand", expiresAt: hours(24) };
    await expect(db.story.create({ data: { ...data, body: "" } })).rejects.toThrow();
  });
});
