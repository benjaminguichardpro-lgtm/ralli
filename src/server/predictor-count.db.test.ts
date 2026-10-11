import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { makeUser } from "../../tests/db/factories";
import { createClub, joinClubByCode } from "./clubs";
import { addMatch, cancelEncounter, createEncounter, getEncounterPage, publishEncounter } from "./encounters";
import { placePrediction } from "./predictions";
import { type MatchResultInput, confirmScore, proposeScore } from "./scores";
import { addNewPlayerToTeam, createExternalTeam, createTeam } from "./teams";

const T0 = new Date("2026-10-10T10:00:00Z");
const START = new Date("2026-10-12T12:00:00Z");
const BEFORE = new Date("2026-10-12T11:00:00Z");
const NOW = new Date("2026-10-12T15:00:00Z");

let admin: string, capA: string, capB: string, ana: string, bob: string, cleo: string, outsider: string;
let enc: string, m1: string, m2: string;

const res = (matchId: string, outcome: MatchResultInput["outcome"], winnerSide: "HOME" | "AWAY" | null): MatchResultInput => ({ matchId, outcome, winnerSide, sets: [] });
const bet = (u: string, matchId: string, side: "HOME" | "AWAY", aces = 20) => placePrediction(u, { matchId, side, committedAces: aces }, BEFORE);
const counts = async (viewer: string | null, at = BEFORE) => (await getEncounterPage(viewer, enc, at)).matches.map((m) => m.predictorCount);

beforeEach(async () => {
  [admin, capA, capB, ana, bob, cleo, outsider] = (await Promise.all(["Admin", "CapA", "CapB", "Ana", "Bob", "Cleo", "Dehors"].map(makeUser))) as [string, string, string, string, string, string, string];
  const club = await createClub(admin, "TC Compteur");
  for (const u of [capA, capB, ana, bob, cleo]) await joinClubByCode(u, club.inviteCode);
  const team = (await createTeam(admin, club.id, { name: "Messieurs 1", captainUserId: capA })).id;
  await createTeam(admin, club.id, { name: "Messieurs 2", captainUserId: capB });
  const ext = (await createExternalTeam(admin, club.id, { name: "TC Voisin 1", externalClubName: "TC Voisin" })).id;
  const mk = async (t: string, f: string, l: string) => (await addNewPlayerToTeam(admin, t, { firstName: f, lastName: l, fftRank: "R30" })).id;
  const p = [await mk(team, "Léa", "Martin"), await mk(team, "Hugo", "Durand")];
  const x = [await mk(ext, "Paul", "Voisin"), await mk(ext, "Marc", "Lenoir")];
  enc = (await createEncounter(capA, { clubTeamId: team, opponentTeamId: ext, clubTeamIsHome: true, startsAt: START }, T0)).id;
  m1 = (await addMatch(capA, enc, { homePlayerId: p[0]!, awayPlayerId: x[0]! }, T0)).id;
  m2 = (await addMatch(capA, enc, { homePlayerId: p[1]!, awayPlayerId: x[1]! }, T0)).id;
  await publishEncounter(capA, enc, T0);
});

describe("nombre de membres qui ont pronostiqué, par match", () => {
  it("zéro au départ ; compte un ralli par membre et par match, sans dire pour qui", async () => {
    expect(await counts(ana)).toEqual([0, 0]);
    await bet(ana, m1, "HOME");
    await bet(bob, m1, "AWAY");
    await bet(cleo, m1, "HOME");
    await bet(ana, m2, "HOME");
    expect(await counts(ana)).toEqual([3, 1]);
    // Le nombre seulement : aucune autre information sur les pronostics dans la vue de la page.
    const view = await getEncounterPage(ana, enc, BEFORE);
    expect(Object.keys(view.matches[0]!)).not.toContain("predictors");
  });

  it("visible de tout le monde : membre qui ne peut pas pronostiquer, non-membre, visiteur sans compte", async () => {
    await bet(ana, m1, "HOME");
    for (const viewer of [capA, admin, outsider, null]) expect(await counts(viewer)).toEqual([1, 0]);
  });

  it("reste affiché après la fermeture des pronostics et après le score", async () => {
    await bet(ana, m1, "HOME");
    await bet(bob, m2, "AWAY");
    expect(await counts(ana, NOW)).toEqual([1, 1]); // pronostics fermés (début passé)
    await proposeScore(capA, enc, [res(m1, "COMPLETED", "HOME"), res(m2, "COMPLETED", "HOME")], NOW);
    await confirmScore(capB, enc, NOW);
    expect(await counts(ana, NOW)).toEqual([1, 1]); // gagné et perdu comptent toujours
  });

  it("les rallis remboursés (rencontre annulée, match non joué) ne comptent plus", async () => {
    await bet(ana, m1, "HOME");
    await bet(bob, m2, "HOME");
    await cancelEncounter(admin, enc, "Test", BEFORE);
    expect(await counts(ana, BEFORE)).toEqual([0, 0]);
    expect((await db.prediction.findMany({ where: { matchId: { in: [m1, m2] } } })).every((p) => p.status === "REFUNDED")).toBe(true);
  });
});
