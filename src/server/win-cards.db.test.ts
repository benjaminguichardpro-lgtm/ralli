import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { makeUser } from "../../tests/db/factories";
import { joinClub } from "./club-directory";
import { createClub } from "./clubs";
import { addMatch, createEncounter, publishEncounter } from "./encounters";
import { placePrediction } from "./predictions";
import { type MatchResultInput, confirmScore, proposeScore } from "./scores";
import { deleteStory, listStoryRings } from "./stories";
import { addNewPlayerToTeam, createExternalTeam, createTeam } from "./teams";
import { dismissReports, getWinShare, listPendingReports, reportStory, shareWin, toggleReaction } from "./win-cards";

// Rallis gagnants en story : partage, carte, délai, réaction 🎾, signalement, garde-fous de la base.

const T0 = new Date("2026-10-10T10:00:00Z");
const BEFORE = new Date("2026-10-12T11:00:00Z");
const SETTLED = new Date("2026-10-12T15:00:00Z");
const DAY = 24 * 3_600_000;

let admin: string, capA: string, capB: string, ana: string, bob: string, outsider: string, clubId: string;
let m1: string, m2: string, encId: string;
let anaWon: string, anaLost: string, bobLost: string;

const res = (matchId: string, winnerSide: "HOME" | "AWAY"): MatchResultInput => ({ matchId, outcome: "COMPLETED", winnerSide, sets: [] });

beforeEach(async () => {
  [admin, capA, capB, ana, bob, outsider] = (await Promise.all(["Admin", "CapA", "CapB", "Ana", "Bob", "Dehors"].map(makeUser))) as [string, string, string, string, string, string];
  const club = await createClub(admin, "TC Cartes");
  clubId = club.id;
  for (const u of [capA, capB, ana, bob]) await joinClub(u, club.id);
  const team = (await createTeam(admin, club.id, { name: "Messieurs 1", captainUserId: capA })).id;
  await createTeam(admin, club.id, { name: "Messieurs 2", captainUserId: capB });
  const ext = (await createExternalTeam(admin, club.id, { name: "TC Voisin 1", externalClubName: "TC Voisin" })).id;
  const mk = async (t: string, f: string, l: string) => (await addNewPlayerToTeam(admin, t, { firstName: f, lastName: l, fftRank: "R30" })).id;
  const p = [await mk(team, "Léa", "Martin"), await mk(team, "Hugo", "Durand")];
  const x = [await mk(ext, "Paul", "Voisin"), await mk(ext, "Marc", "Lenoir")];
  encId = (await createEncounter(capA, { clubTeamId: team, opponentTeamId: ext, clubTeamIsHome: true, startsAt: new Date("2026-10-12T12:00:00Z") }, T0)).id;
  m1 = (await addMatch(capA, encId, { homePlayerId: p[0]!, awayPlayerId: x[0]! }, T0)).id;
  m2 = (await addMatch(capA, encId, { homePlayerId: p[1]!, awayPlayerId: x[1]! }, T0)).id;
  await publishEncounter(capA, encId, T0);
  anaWon = (await placePrediction(ana, { matchId: m1, side: "HOME", committedAces: 100 }, BEFORE)).id;
  anaLost = (await placePrediction(ana, { matchId: m2, side: "AWAY", committedAces: 50 }, BEFORE)).id;
  bobLost = (await placePrediction(bob, { matchId: m1, side: "AWAY", committedAces: 80 }, BEFORE)).id;
  await proposeScore(capA, encId, [res(m1, "HOME"), res(m2, "HOME")], SETTLED);
  await confirmScore(capB, encId, SETTLED);
});

const balance = async (userId: string) => (await db.ledgerEntry.aggregate({ where: { userId }, _sum: { amount: true } }))._sum.amount ?? 0;
const NOW = new Date("2026-10-13T09:00:00Z"); // le lendemain du règlement

describe("partager un ralli gagné", () => {
  it("la carte reprend les chiffres du ralli, avec le commentaire et un club pour public", async () => {
    const win = await getWinShare(ana, anaWon, NOW);
    expect(win.state).toBe("can");
    expect(win.clubName).toBe("TC Cartes");
    expect(win.card).toMatchObject({ matchLabel: "Léa Martin contre Paul Voisin", pickedName: "Léa Martin", committedAces: 100 });
    expect(win.card.payoutAces).toBeGreaterThan(100);

    const { id, clubId: shownTo } = await shareWin(ana, anaWon, "  Quel match !  ", NOW);
    expect(shownTo).toBe(clubId);
    const story = await db.story.findUniqueOrThrow({ where: { id } });
    expect(story).toMatchObject({ kind: "WIN_CARD", clubId, authorId: ana, body: "Quel match !", predictionId: anaWon, deletedAt: null });
    expect(story.expiresAt.getTime() - NOW.getTime()).toBe(DAY);
    expect((await getWinShare(ana, anaWon, NOW)).state).toBe("shared");
  });

  it("le commentaire est facultatif", async () => {
    const { id } = await shareWin(ana, anaWon, "", NOW);
    expect((await db.story.findUniqueOrThrow({ where: { id } })).body).toBe("");
  });

  it("une seule carte par ralli", async () => {
    await shareWin(ana, anaWon, "", NOW);
    await expect(shareWin(ana, anaWon, "encore", NOW)).rejects.toMatchObject({ code: "ALREADY_SHARED" });
  });

  it("un ralli perdu, remboursé ou d'un autre compte ne se partage pas", async () => {
    await expect(shareWin(ana, anaLost, "", NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(shareWin(bob, bobLost, "", NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(shareWin(bob, anaWon, "", NOW)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(shareWin(ana, "inexistant", "", NOW)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("7 jours après le règlement : encore possible ; ensuite fermé", async () => {
    const dayRaw = new Date(SETTLED.getTime() + 7 * DAY);
    expect((await getWinShare(ana, anaWon, dayRaw)).state).toBe("can");
    const tooLate = new Date(SETTLED.getTime() + 7 * DAY + 1);
    expect((await getWinShare(ana, anaWon, tooLate)).state).toBe("closed");
    await expect(shareWin(ana, anaWon, "", tooLate)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("quelqu'un qui a quitté le club ne peut plus partager", async () => {
    await db.clubMembership.delete({ where: { userId_clubId: { userId: ana, clubId } } });
    expect((await getWinShare(ana, anaWon, NOW)).state).toBe("closed");
    await expect(shareWin(ana, anaWon, "", NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("commentaire de plus de 140 caractères ou avec un mot interdit : refusé", async () => {
    await expect(shareWin(ana, anaWon, "a".repeat(141), NOW)).rejects.toMatchObject({ code: "STORY_INVALID" });
    await expect(shareWin(ana, anaWon, "Beau pari !", NOW)).rejects.toMatchObject({ code: "STORY_INVALID" });
    await shareWin(ana, anaWon, "a".repeat(140), NOW);
  });

  it("partager ne rapporte aucun Ace", async () => {
    const before = await balance(ana);
    await shareWin(ana, anaWon, "Bravo à moi", NOW);
    expect(await balance(ana)).toBe(before);
  });

  it("supprimer la carte permet d'en publier une autre pour le même ralli", async () => {
    const { id } = await shareWin(ana, anaWon, "", NOW);
    await deleteStory(ana, id, NOW);
    expect((await getWinShare(ana, anaWon, NOW)).state).toBe("can");
    await shareWin(ana, anaWon, "Deuxième essai", NOW);
  });
});

describe("rond « Rallis gagnants »", () => {
  it("les membres voient la carte dans un rond à part ; pas les autres", async () => {
    await shareWin(ana, anaWon, "Quel match !", NOW);
    const rings = await listStoryRings(bob, { now: NOW });
    expect(rings).toHaveLength(1);
    expect(rings[0]).toMatchObject({ wins: true, key: `${clubId}:wins`, clubName: "TC Cartes", unseen: 1 });
    const story = rings[0]!.stories[0]!;
    expect(story).toMatchObject({ kind: "WIN_CARD", authorName: "Ana", isMine: false, canReact: true, body: "Quel match !" });
    expect(story.winCard).toMatchObject({ matchLabel: "Léa Martin contre Paul Voisin", committedAces: 100 });
    expect(await listStoryRings(outsider, { now: NOW })).toEqual([]);
    expect((await listStoryRings(ana, { now: NOW }))[0]!.stories[0]).toMatchObject({ isMine: true, canReact: false });
  });

  it("disparaît après 24 h", async () => {
    await shareWin(ana, anaWon, "", NOW);
    expect(await listStoryRings(bob, { now: new Date(NOW.getTime() + DAY + 1) })).toEqual([]);
  });
});

describe("réaction 🎾", () => {
  let storyId: string;
  beforeEach(async () => {
    storyId = (await shareWin(ana, anaWon, "", NOW)).id;
  });
  const card = async (viewer: string) => (await listStoryRings(viewer, { now: NOW }))[0]!.stories[0]!;

  it("une réaction par membre, retirée si on la retouche ; le nombre pour tous, les noms pour l'auteur et les admins", async () => {
    await expect(toggleReaction(bob, storyId, NOW)).resolves.toEqual({ reacted: true });
    await toggleReaction(capA, storyId, NOW);
    expect((await card(bob)).reactions).toEqual({ count: 2, mine: true, names: null });
    expect((await card(ana)).reactions).toMatchObject({ count: 2, mine: false, names: ["Bob", "CapA"] });
    expect((await card(admin)).reactions.names).toEqual(["Bob", "CapA"]);
    await expect(toggleReaction(bob, storyId, NOW)).resolves.toEqual({ reacted: false });
    expect((await card(ana)).reactions).toMatchObject({ count: 1, names: ["CapA"] });
  });

  it("pas sur sa propre carte, pas hors du club, pas sur une carte expirée ou supprimée", async () => {
    await expect(toggleReaction(ana, storyId, NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(toggleReaction(outsider, storyId, NOW)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(toggleReaction(bob, storyId, new Date(NOW.getTime() + DAY + 1))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await deleteStory(ana, storyId, NOW);
    await expect(toggleReaction(bob, storyId, NOW)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("une annonce de club n'a pas de réaction", async () => {
    const post = await db.story.create({ data: { clubId, authorId: admin, body: "Annonce", background: "brand", expiresAt: new Date(NOW.getTime() + DAY) } });
    await expect(toggleReaction(bob, post.id, NOW)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("signalement", () => {
  let storyId: string;
  beforeEach(async () => {
    storyId = (await shareWin(ana, anaWon, "Propos limite", NOW)).id;
  });

  it("un membre signale une fois ; les admins voient le motif mais pas qui a signalé", async () => {
    await reportStory(bob, storyId, "Pas sympa", NOW);
    await expect(reportStory(bob, storyId, "", NOW)).rejects.toMatchObject({ code: "ALREADY_REPORTED" });
    await reportStory(capA, storyId, "", NOW);
    const pending = await listPendingReports(admin, clubId);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ storyId, authorName: "Ana", comment: "Propos limite", matchLabel: "Léa Martin contre Paul Voisin" });
    expect(pending[0]!.reports.map((r) => r.reason)).toEqual(["Pas sympa", null]);
    expect(JSON.stringify(pending)).not.toContain("Bob");
    expect((await listStoryRings(bob, { now: NOW }))[0]!.stories[0]!.reportedByMe).toBe(true);
    expect((await listStoryRings(capA, { now: NOW }))[0]!.stories[0]!.reportedByMe).toBe(true);
    expect((await listStoryRings(ana, { now: NOW }))[0]!.stories[0]!.reportedByMe).toBe(false);
  });

  it("pas sa propre carte, pas hors du club ; motif de 200 caractères au plus", async () => {
    await expect(reportStory(ana, storyId, "", NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(reportStory(outsider, storyId, "", NOW)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(reportStory(bob, storyId, "a".repeat(201), NOW)).rejects.toMatchObject({ code: "STORY_INVALID" });
  });

  it("seuls les admins du club voient et traitent les signalements", async () => {
    await reportStory(bob, storyId, "", NOW);
    await expect(listPendingReports(ana, clubId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listPendingReports(capA, clubId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(dismissReports(bob, storyId, NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("écarter un signalement garde la carte ; la supprimer le règle aussi", async () => {
    await reportStory(bob, storyId, "", NOW);
    await dismissReports(admin, storyId, NOW);
    expect(await listPendingReports(admin, clubId)).toEqual([]);
    expect((await db.story.findUniqueOrThrow({ where: { id: storyId } })).deletedAt).toBeNull();

    await reportStory(capA, storyId, "", NOW);
    expect(await listPendingReports(admin, clubId)).toHaveLength(1);
    await deleteStory(admin, storyId, NOW);
    expect(await listPendingReports(admin, clubId)).toEqual([]);
    expect(await db.storyReport.count({ where: { storyId, handledAt: null } })).toBe(0);
  });
});

describe("garde-fous de la base", () => {
  const tomorrow = () => new Date(NOW.getTime() + DAY);

  it("une carte a toujours un ralli et au plus 140 caractères ; une annonce n'a jamais de ralli", async () => {
    const base = { clubId, authorId: ana, background: "brand", expiresAt: tomorrow() };
    await expect(db.story.create({ data: { ...base, kind: "WIN_CARD", body: "" } })).rejects.toThrow();
    await expect(db.story.create({ data: { ...base, kind: "WIN_CARD", body: "a".repeat(141), predictionId: anaWon } })).rejects.toThrow();
    await expect(db.story.create({ data: { ...base, kind: "CLUB_POST", body: "Annonce", predictionId: anaWon } })).rejects.toThrow();
    await expect(db.story.create({ data: { ...base, kind: "CLUB_POST", body: "" } })).rejects.toThrow();
    await expect(db.story.create({ data: { ...base, kind: "WIN_CARD", body: "", predictionId: anaWon } })).resolves.toBeDefined();
  });

  it("deux cartes vivantes pour le même ralli : refusé, même en contournant l'application", async () => {
    const data = { clubId, authorId: ana, background: "brand", expiresAt: tomorrow(), kind: "WIN_CARD" as const, body: "", predictionId: anaWon };
    await db.story.create({ data });
    await expect(db.story.create({ data })).rejects.toThrow();
  });

  it("un motif de signalement de plus de 200 caractères est refusé", async () => {
    const { id } = await shareWin(ana, anaWon, "", NOW);
    await expect(db.storyReport.create({ data: { storyId: id, reporterId: bob, reason: "a".repeat(201) } })).rejects.toThrow();
  });
});
