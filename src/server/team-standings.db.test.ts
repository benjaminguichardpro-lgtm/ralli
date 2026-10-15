import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { makeUser } from "../../tests/db/factories";
import { joinClub } from "./club-directory";
import { createClub } from "./clubs";
import { addMatch, createEncounter, publishEncounter } from "./encounters";
import { type MatchResultInput, confirmScore, proposeScore } from "./scores";
import { getTeamStandings } from "./team-standings";
import { addNewPlayerToTeam, createExternalTeam, createTeam } from "./teams";

const T0 = new Date("2026-10-10T10:00:00Z");
const NOW = new Date("2026-10-12T15:00:00Z");
const LATER = new Date("2026-10-12T16:00:00Z");

let admin: string, capA: string, capB: string, ana: string, bob: string, clubId: string;
let e1: string, e2: string, e1m: string[], e2m: string[];

const res = (matchId: string, outcome: MatchResultInput["outcome"], winnerSide: "HOME" | "AWAY" | null): MatchResultInput => ({ matchId, outcome, winnerSide, sets: [] });
const settle = async (enc: string, results: MatchResultInput[], at: Date) => {
  await proposeScore(capA, enc, results, at);
  await confirmScore(capB, enc, at);
};

beforeEach(async () => {
  [admin, capA, capB, ana, bob] = (await Promise.all(["Admin", "CapA", "CapB", "Ana", "Bob"].map(makeUser))) as [string, string, string, string, string];
  const club = await createClub(admin, "TC Résultats");
  clubId = club.id;
  for (const u of [capA, capB, ana, bob]) await joinClub(u, club.id);
  const team = (await createTeam(admin, club.id, { name: "Messieurs 1", captainUserId: capA })).id;
  await createTeam(admin, club.id, { name: "Messieurs 2", captainUserId: capB });
  const ext = (await createExternalTeam(admin, club.id, { name: "TC Voisin 1", externalClubName: "TC Voisin" })).id;
  const mk = async (t: string, f: string, l: string, r: "R30" | "R30_1" | "R15_5") => (await addNewPlayerToTeam(admin, t, { firstName: f, lastName: l, fftRank: r })).id;
  const p = [await mk(team, "Léa", "Martin", "R30"), await mk(team, "Hugo", "Durand", "R30_1"), await mk(team, "Inès", "Petit", "R15_5")];
  const x = [await mk(ext, "Paul", "Voisin", "R30_1"), await mk(ext, "Marc", "Lenoir", "R30_1"), await mk(ext, "Yann", "Roux", "R30")];
  const make = async (startsAt: Date) => {
    const enc = (await createEncounter(capA, { clubTeamId: team, opponentTeamId: ext, clubTeamIsHome: true, startsAt }, T0)).id;
    const ms = [
      (await addMatch(capA, enc, { homePlayerId: p[0]!, awayPlayerId: x[0]! }, T0)).id,
      (await addMatch(capA, enc, { homePlayerId: p[1]!, awayPlayerId: x[1]! }, T0)).id,
      (await addMatch(capA, enc, { homePlayerId: p[2]!, awayPlayerId: x[2]! }, T0)).id,
    ];
    await publishEncounter(capA, enc, T0);
    return { enc, ms };
  };
  ({ enc: e1, ms: e1m } = await make(new Date("2026-10-12T12:00:00Z")));
  ({ enc: e2, ms: e2m } = await make(new Date("2026-10-12T13:00:00Z")));
});


describe("classement des équipes", () => {
  it("compte seulement les rencontres confirmées ; équipe sans rencontre en bas", async () => {
    await settle(e1, [res(e1m[0]!, "COMPLETED", "HOME"), res(e1m[1]!, "COMPLETED", "HOME"), res(e1m[2]!, "COMPLETED", "AWAY")], NOW);
    // e2 : score proposé seulement (provisoire) → ne compte pas.
    await proposeScore(capA, e2, [res(e2m[0]!, "COMPLETED", "HOME"), res(e2m[1]!, "COMPLETED", "HOME"), res(e2m[2]!, "COMPLETED", "HOME")], LATER);
    const s = await getTeamStandings(clubId, 2026, LATER);
    expect(s.rows.map((r) => [r.name, r.played, r.won, r.points, r.diff])).toEqual([
      ["Messieurs 1", 1, 1, 3, 1],
      ["Messieurs 2", 0, 0, 0, 0],
    ]);
    expect(s.years).toEqual([2026]);
  });

  it("défaite et nul : 0 et 1 point ; saison précédente vide", async () => {
    await settle(e1, [res(e1m[0]!, "COMPLETED", "AWAY"), res(e1m[1]!, "COMPLETED", "AWAY"), res(e1m[2]!, "COMPLETED", "HOME")], NOW);
    await settle(e2, [res(e2m[0]!, "COMPLETED", "HOME"), res(e2m[1]!, "COMPLETED", "AWAY"), res(e2m[2]!, "NOT_PLAYED", null)], LATER);
    const r = (await getTeamStandings(clubId, 2026, LATER)).rows.find((x) => x.name === "Messieurs 1")!;
    expect([r.played, r.won, r.drawn, r.lost, r.points, r.diff]).toEqual([2, 0, 1, 1, 1, -1]);
    const prev = await getTeamStandings(clubId, 2025, LATER);
    expect(prev.rows.every((x) => x.played === 0)).toBe(true);
  });

  it("une rencontre du 31 août appartient à la saison précédente", async () => {
    await settle(e1, [res(e1m[0]!, "COMPLETED", "HOME"), res(e1m[1]!, "COMPLETED", "HOME"), res(e1m[2]!, "COMPLETED", "HOME")], NOW);
    await db.encounter.update({ where: { id: e1 }, data: { startsAt: new Date("2026-08-31T10:00:00Z") } });
    expect((await getTeamStandings(clubId, 2026, LATER)).rows.every((x) => x.played === 0)).toBe(true);
    expect((await getTeamStandings(clubId, 2025, LATER)).rows[0]!.played).toBe(1);
  });
});
