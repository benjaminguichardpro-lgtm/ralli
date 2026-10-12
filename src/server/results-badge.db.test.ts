import { beforeEach, describe, expect, it } from "vitest";
import { makeUser } from "../../tests/db/factories";
import { joinClub } from "./club-directory";
import { createClub } from "./clubs";
import { addMatch, createEncounter, publishEncounter } from "./encounters";
import { hasUnseenResults, markResultsSeen } from "./onboarding";
import { placePrediction } from "./predictions";
import { type MatchResultInput, confirmScore, proposeScore } from "./scores";
import { addNewPlayerToTeam, createExternalTeam, createTeam } from "./teams";

const T0 = new Date("2026-10-10T10:00:00Z");
const BEFORE = new Date("2026-10-12T11:00:00Z");
const NOW = new Date("2026-10-12T15:00:00Z");
const LATER = new Date("2026-10-12T16:00:00Z");

let capA: string, capB: string, ana: string, bob: string;
let e1: string, e2: string, a1: string, a2: string;

const res = (matchId: string, winnerSide: "HOME" | "AWAY"): MatchResultInput => ({ matchId, outcome: "COMPLETED", winnerSide, sets: [] });
const settle = async (enc: string, matchId: string, at: Date) => {
  await proposeScore(capA, enc, [res(matchId, "HOME")], at);
  await confirmScore(capB, enc, at);
};

beforeEach(async () => {
  let admin: string;
  [admin, capA, capB, ana, bob] = (await Promise.all(["Admin", "CapA", "CapB", "Ana", "Bob"].map(makeUser))) as [string, string, string, string, string];
  const club = await createClub(admin, "TC Pastille");
  for (const u of [capA, capB, ana, bob]) await joinClub(u, club.id);
  const team = (await createTeam(admin, club.id, { name: "Messieurs 1", captainUserId: capA })).id;
  await createTeam(admin, club.id, { name: "Messieurs 2", captainUserId: capB });
  const ext = (await createExternalTeam(admin, club.id, { name: "TC Voisin 1", externalClubName: "TC Voisin" })).id;
  const mk = async (t: string, f: string, l: string) => (await addNewPlayerToTeam(admin, t, { firstName: f, lastName: l, fftRank: "R30" })).id;
  const p = [await mk(team, "Léa", "Martin"), await mk(team, "Hugo", "Durand")];
  const x = [await mk(ext, "Paul", "Voisin"), await mk(ext, "Marc", "Lenoir")];
  const make = async (startsAt: Date, i: number) => {
    const enc = (await createEncounter(capA, { clubTeamId: team, opponentTeamId: ext, clubTeamIsHome: true, startsAt }, T0)).id;
    const m = (await addMatch(capA, enc, { homePlayerId: p[i]!, awayPlayerId: x[i]! }, T0)).id;
    await publishEncounter(capA, enc, T0);
    return { enc, m };
  };
  ({ enc: e1, m: a1 } = await make(new Date("2026-10-12T12:00:00Z"), 0));
  ({ enc: e2, m: a2 } = await make(new Date("2026-10-12T13:00:00Z"), 1));
});

describe("pastille « nouveaux résultats » sur l'onglet Mes rallis", () => {
  it("aucune pastille sans ralli réglé, ni tant que le ralli est en attente", async () => {
    expect(await hasUnseenResults(ana)).toBe(false);
    await placePrediction(ana, { matchId: a1, side: "HOME", committedAces: 20 }, BEFORE);
    expect(await hasUnseenResults(ana)).toBe(false);
  });

  it("apparaît au règlement, disparaît quand la popup de résultats est fermée, revient pour un nouveau résultat", async () => {
    await placePrediction(ana, { matchId: a1, side: "HOME", committedAces: 20 }, BEFORE);
    await placePrediction(ana, { matchId: a2, side: "HOME", committedAces: 20 }, BEFORE);
    await settle(e1, a1, NOW);
    expect(await hasUnseenResults(ana)).toBe(true);
    await markResultsSeen(ana, NOW, LATER); // la popup est fermée jusqu'au dernier ralli montré
    expect(await hasUnseenResults(ana)).toBe(false);
    await settle(e2, a2, LATER);
    expect(await hasUnseenResults(ana)).toBe(true);
  });

  it("chacun sa pastille : celui qui n'a rien pronostiqué n'en a pas", async () => {
    await placePrediction(ana, { matchId: a1, side: "HOME", committedAces: 20 }, BEFORE);
    await settle(e1, a1, NOW);
    expect(await hasUnseenResults(ana)).toBe(true);
    expect(await hasUnseenResults(bob)).toBe(false);
  });
});
