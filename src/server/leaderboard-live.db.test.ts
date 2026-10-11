import { beforeEach, describe, expect, it } from "vitest";
import { makeUser } from "../../tests/db/factories";
import { createClub, joinClubByCode } from "./clubs";
import { addMatch, createEncounter, publishEncounter } from "./encounters";
import { getLeaderboard } from "./leaderboard";
import { placePrediction } from "./predictions";
import { type MatchResultInput, confirmScore, proposeScore } from "./scores";
import { addNewPlayerToTeam, createExternalTeam, createTeam } from "./teams";

// Semaine du lundi 12 octobre 2026 (00 h, heure de Paris = 2026-10-11T22:00Z). « Maintenant » : mercredi 14 octobre.
const T0 = new Date("2026-10-09T10:00:00Z");
const NOW = new Date("2026-10-14T10:00:00Z");
const START1 = new Date("2026-10-10T12:00:00Z"); // rencontre 1 : réglée AVANT lundi
const START2 = new Date("2026-10-13T12:00:00Z"); // rencontre 2 : réglée APRÈS lundi
const BEFORE1 = new Date("2026-10-10T11:00:00Z");
const BEFORE2 = new Date("2026-10-13T11:00:00Z");
const SETTLE1 = new Date("2026-10-10T15:00:00Z");
const SETTLE2 = new Date("2026-10-13T15:00:00Z");

let capA: string, capB: string, ana: string, bob: string, cleo: string, clubId: string;
let e1: string, e2: string, m1: string[], m2: string[];

const res = (matchId: string, winnerSide: "HOME" | "AWAY"): MatchResultInput => ({ matchId, outcome: "COMPLETED", winnerSide, sets: [] });
const settle = async (enc: string, ms: string[], at: Date) => {
  await proposeScore(capA, enc, ms.map((m) => res(m, "HOME")), at); // le côté domicile gagne partout
  await confirmScore(capB, enc, at);
};
const board = (viewer: string, period: "season" | "week" = "season") => getLeaderboard(viewer, clubId, period, { now: NOW });

beforeEach(async () => {
  let admin: string;
  [admin, capA, capB, ana, bob, cleo] = (await Promise.all(["Admin", "CapA", "CapB", "Ana", "Bob", "Cleo"].map(makeUser))) as [string, string, string, string, string, string];
  const club = await createClub(admin, "TC Classement vivant");
  clubId = club.id;
  for (const u of [capA, capB, ana, bob, cleo]) await joinClubByCode(u, club.inviteCode);
  const team = (await createTeam(admin, club.id, { name: "Messieurs 1", captainUserId: capA })).id;
  await createTeam(admin, club.id, { name: "Messieurs 2", captainUserId: capB });
  const ext = (await createExternalTeam(admin, club.id, { name: "TC Voisin 1", externalClubName: "TC Voisin" })).id;
  const mk = async (t: string, f: string, l: string) => (await addNewPlayerToTeam(admin, t, { firstName: f, lastName: l, fftRank: "R30" })).id;
  const p = [await mk(team, "Léa", "Martin"), await mk(team, "Hugo", "Durand"), await mk(team, "Inès", "Petit")];
  const x = [await mk(ext, "Paul", "Voisin"), await mk(ext, "Marc", "Lenoir"), await mk(ext, "Yann", "Roux")];
  const make = async (startsAt: Date) => {
    const enc = (await createEncounter(capA, { clubTeamId: team, opponentTeamId: ext, clubTeamIsHome: true, startsAt }, T0)).id;
    const ms: string[] = [];
    for (let i = 0; i < 3; i++) ms.push((await addMatch(capA, enc, { homePlayerId: p[i]!, awayPlayerId: x[i]! }, T0)).id);
    await publishEncounter(capA, enc, T0);
    return { enc, ms };
  };
  ({ enc: e1, ms: m1 } = await make(START1));
  ({ enc: e2, ms: m2 } = await make(START2));
});

/** Avant lundi : Ana gagne 3 rallis (100 chacun), Bob en perd 3 (10 chacun). Après lundi : Bob gagne gros, Ana perd un peu, Cleo gagne 3 rallis. */
async function play() {
  for (const m of m1) {
    await placePrediction(ana, { matchId: m, side: "HOME", committedAces: 100 }, BEFORE1);
    await placePrediction(bob, { matchId: m, side: "AWAY", committedAces: 10 }, BEFORE1);
  }
  await settle(e1, m1, SETTLE1);
  for (const m of m2) {
    await placePrediction(bob, { matchId: m, side: "HOME", committedAces: 300 }, BEFORE2);
    await placePrediction(ana, { matchId: m, side: "AWAY", committedAces: 10 }, BEFORE2);
    await placePrediction(cleo, { matchId: m, side: "HOME", committedAces: 20 }, BEFORE2);
  }
  await settle(e2, m2, SETTLE2);
}

describe("mouvement de place depuis lundi (classement de la saison)", () => {
  it("monté, descendu, nouveau : comparé au classement de lundi 00 h", async () => {
    await play();
    // Lundi : Ana 1re (≈ +300), Bob 2e (−30), Cleo pas classée (0 ralli). Maintenant : Bob 1er (≈ +870), Ana 2e (≈ +270), Cleo 3e (≈ +60, 3 rallis).
    const b = await board(bob);
    expect(b.top.map((r) => [r.displayName, r.rank])).toEqual([["Bob", 1], ["Ana", 2], ["Cleo", 3]]);
    expect(b.myMove).toEqual({ kind: "up", places: 1 }); // Bob : 2e -> 1er
    expect((await board(ana)).myMove).toEqual({ kind: "down", places: 1 }); // Ana : 1re -> 2e
    expect((await board(cleo)).myMove).toEqual({ kind: "new" }); // pas classée lundi
  });

  it("rien avant d'être classé ; pas de mouvement sur le classement de la semaine", async () => {
    await play();
    expect((await board(capA)).myMove).toBeNull(); // pas classé du tout
    expect((await board(capA)).myRow).toBeNull();
    const w = await board(bob, "week");
    expect(w.myMove).toBeNull(); // « depuis lundi » n'a pas de sens sur la semaine
    expect(w.myRow?.rank).toBe(1);
  });

  it("inchangé quand rien ne s'est passé depuis lundi", async () => {
    for (const m of m1) {
      await placePrediction(ana, { matchId: m, side: "HOME", committedAces: 100 }, BEFORE1);
      await placePrediction(bob, { matchId: m, side: "AWAY", committedAces: 10 }, BEFORE1);
    }
    await settle(e1, m1, SETTLE1);
    expect((await board(ana)).myMove).toEqual({ kind: "same", places: 0 });
    expect((await board(bob)).myMove).toEqual({ kind: "same", places: 0 });
  });
});

describe("leader de la semaine", () => {
  it("le meilleur bénéfice depuis lundi, visible sur les deux classements", async () => {
    await play();
    const season = await board(ana);
    const week = await board(ana, "week");
    expect(season.weekLeaders).toEqual({ names: ["Bob"], net: expect.any(Number) });
    expect(season.weekLeaders!.net).toBeGreaterThan(0);
    expect(week.weekLeaders).toEqual(season.weekLeaders);
  });

  it("personne : aucune rencontre réglée cette semaine, ou tout le monde perd", async () => {
    expect((await board(ana)).weekLeaders).toBeNull(); // rien de réglé
    for (const m of m1) await placePrediction(ana, { matchId: m, side: "AWAY", committedAces: 50 }, BEFORE1);
    await settle(e1, m1, SETTLE1); // réglée avant lundi
    expect((await board(ana)).weekLeaders).toBeNull(); // rien de réglé depuis lundi
    for (const m of m2) await placePrediction(bob, { matchId: m, side: "AWAY", committedAces: 50 }, BEFORE2);
    await settle(e2, m2, SETTLE2);
    expect((await board(ana)).weekLeaders).toBeNull(); // cette semaine, Bob a seulement perdu
  });
});
