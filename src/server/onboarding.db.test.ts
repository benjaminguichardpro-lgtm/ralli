import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { makeUser } from "../../tests/db/factories";
import { createClub, joinClubByCode } from "./clubs";
import { addMatch, cancelEncounter, createEncounter, publishEncounter } from "./encounters";
import { getUnseenResults, markOnboardingSeen, markResultsSeen } from "./onboarding";
import { placePrediction } from "./predictions";
import { confirmScore, proposeScore } from "./scores";
import { addNewPlayerToTeam, createExternalTeam, createTeam } from "./teams";

const CREATED = new Date("2026-10-01T10:00:00Z");
const START = new Date("2026-10-05T14:00:00Z");
const BEFORE = new Date("2026-10-05T12:00:00Z");
const AFTER = new Date("2026-10-05T18:00:00Z");
const LATER = new Date("2026-10-06T18:00:00Z");

let admin: string, cap: string, bettor: string, other: string;
let clubId: string, teamId: string, extId: string;
let players: { a: string[]; ext: string[] };

beforeEach(async () => {
  [admin, cap, bettor, other] = (await Promise.all(["Admin", "Cap", "Parieur", "Autre"].map(makeUser))) as [string, string, string, string];
  const club = await createClub(admin, "TC Récap");
  clubId = club.id;
  for (const u of [cap, bettor, other]) await joinClubByCode(u, club.inviteCode);
  teamId = (await createTeam(admin, clubId, { name: "Messieurs 1", captainUserId: cap })).id;
  extId = (await createExternalTeam(admin, clubId, { name: "TC Voisin 1", externalClubName: "TC Voisin" })).id;
  const mk = async (team: string, f: string, r: "R30" | "R30_1") => (await addNewPlayerToTeam(admin, team, { firstName: f, lastName: "Nom", fftRank: r })).id;
  players = { a: [await mk(teamId, "A1", "R30"), await mk(teamId, "A2", "R30")], ext: [await mk(extId, "E1", "R30_1"), await mk(extId, "E2", "R30_1")] };
});

/** Rencontre publiée à deux simples ; `bettor` pronostique HOME (100 Aces) sur le premier et AWAY (50) sur le second. */
async function openEncounter() {
  const id = (await createEncounter(cap, { clubTeamId: teamId, opponentTeamId: extId, clubTeamIsHome: true, startsAt: START }, CREATED)).id;
  const matchIds = [
    (await addMatch(cap, id, { homePlayerId: players.a[0]!, awayPlayerId: players.ext[0]! }, CREATED)).id,
    (await addMatch(cap, id, { homePlayerId: players.a[1]!, awayPlayerId: players.ext[1]! }, CREATED)).id,
  ];
  await publishEncounter(cap, id, CREATED);
  await placePrediction(bettor, { matchId: matchIds[0]!, side: "HOME", committedAces: 100 }, BEFORE);
  await placePrediction(bettor, { matchId: matchIds[1]!, side: "AWAY", committedAces: 50 }, BEFORE);
  return { id, matchIds };
}

/** Les deux simples sont gagnés par l'équipe du club (HOME), règlement à `at`. */
async function settleHomeWins(e: { id: string; matchIds: string[] }, at: Date) {
  const results = e.matchIds.map((matchId) => ({ matchId, outcome: "COMPLETED" as const, winnerSide: "HOME" as const, sets: [] }));
  await proposeScore(cap, e.id, results, at);
  await confirmScore(admin, e.id, at);
}

describe("guide du premier lancement", () => {
  it("un compte neuf ne l'a pas vu ; le marquer garde la première date", async () => {
    const before = await db.user.findUniqueOrThrow({ where: { id: bettor }, select: { onboardingSeenAt: true, resultsSeenAt: true } });
    expect(before).toEqual({ onboardingSeenAt: null, resultsSeenAt: null });
    await markOnboardingSeen(bettor, new Date("2026-10-06T10:00:00Z"));
    await markOnboardingSeen(bettor, new Date("2026-10-09T10:00:00Z"));
    const after = await db.user.findUniqueOrThrow({ where: { id: bettor }, select: { onboardingSeenAt: true } });
    expect(after.onboardingSeenAt?.toISOString()).toBe("2026-10-06T10:00:00.000Z");
  });
});

describe("récapitulatif des pronostics réglés", () => {
  it("rien tant que rien n'est réglé, rien pour qui n'a pas pronostiqué", async () => {
    const e = await openEncounter();
    expect(await getUnseenResults(bettor)).toBeNull();
    await settleHomeWins(e, AFTER);
    expect(await getUnseenResults(other)).toBeNull();
  });

  it("une rencontre réglée : gagné et perdu, total des Aces gagnés, titre de la rencontre", async () => {
    const e = await openEncounter();
    await settleHomeWins(e, AFTER);
    const recap = (await getUnseenResults(bettor))!;
    expect(recap).toMatchObject({ won: 1, lost: 1, refunded: 0, cutoff: AFTER.toISOString() });
    expect(recap.wonAces).toBeGreaterThan(100); // 100 Aces engagés à une cote > 1
    expect(recap.encounters).toHaveLength(1);
    expect(recap.encounters[0]!.title).toBe("TC Récap · Messieurs 1 – TC Voisin 1");
    expect(recap.encounters[0]!.items.map((i) => i.status).sort()).toEqual(["LOST", "WON"]);
    const lost = recap.encounters[0]!.items.find((i) => i.status === "LOST")!;
    expect(lost).toMatchObject({ payoutAces: 0, committedAces: 50 });
    expect(lost.pickedName).toBe("E2 N.");
  });

  it("après la fermeture, seuls les pronostics réglés ensuite reviennent", async () => {
    const first = await openEncounter();
    await settleHomeWins(first, AFTER);
    const seen = (await getUnseenResults(bettor))!;
    await markResultsSeen(bettor, new Date(seen.cutoff), LATER);
    expect(await getUnseenResults(bettor)).toBeNull();

    const second = await openEncounter();
    await settleHomeWins(second, LATER);
    const recap = (await getUnseenResults(bettor))!;
    expect(recap.encounters.map((x) => x.encounterId)).toEqual([second.id]);
  });

  it("une rencontre annulée : pronostics remboursés, sans gain", async () => {
    const e = await openEncounter();
    await cancelEncounter(cap, e.id, "Pluie", BEFORE);
    const recap = (await getUnseenResults(bettor))!;
    expect(recap).toMatchObject({ won: 0, lost: 0, refunded: 2, wonAces: 0 });
    expect(recap.encounters[0]!.items.map((i) => [i.status, i.payoutAces])).toEqual(expect.arrayContaining([["REFUNDED", 100], ["REFUNDED", 50]]));
  });

  it("les pronostics en attente ne figurent pas au récapitulatif", async () => {
    await openEncounter();
    expect(await getUnseenResults(bettor)).toBeNull();
  });
});

describe("marquer les résultats vus", () => {
  it("refuse une date future ou invalide, et ne recule jamais", async () => {
    const now = new Date("2026-10-10T10:00:00Z");
    await expect(markResultsSeen(bettor, new Date("2027-01-01T00:00:00Z"), now)).rejects.toMatchObject({ code: "INVALID" });
    await expect(markResultsSeen(bettor, new Date("pas une date"), now)).rejects.toMatchObject({ code: "INVALID" });
    await markResultsSeen(bettor, new Date("2026-10-08T00:00:00Z"), now);
    await markResultsSeen(bettor, new Date("2026-10-07T00:00:00Z"), now);
    const u = await db.user.findUniqueOrThrow({ where: { id: bettor }, select: { resultsSeenAt: true } });
    expect(u.resultsSeenAt?.toISOString()).toBe("2026-10-08T00:00:00.000Z");
  });
});
