import { describe, expect, it } from "vitest";
import { computeStandings, parseSeason, seasonYearOf } from "./teams";

const teams = [{ id: "a", name: "Équipe 1" }, { id: "b", name: "Équipe 2" }, { id: "c", name: "Équipe 3" }];

describe("computeStandings", () => {
  it("victoire 3, nul 1, défaite 0", () => {
    const r = computeStandings(teams, [
      { teamId: "a", scored: 4, conceded: 2 },
      { teamId: "a", scored: 3, conceded: 3 },
      { teamId: "a", scored: 1, conceded: 5 },
    ]);
    const a = r.find((x) => x.teamId === "a")!;
    expect([a.played, a.won, a.drawn, a.lost, a.points, a.diff]).toEqual([3, 1, 1, 1, 4, -2]);
  });

  it("départage : différence, puis victoires, puis nom ; égalité parfaite = même rang", () => {
    const r = computeStandings(teams, [
      { teamId: "a", scored: 3, conceded: 2 },
      { teamId: "b", scored: 6, conceded: 0 },
      { teamId: "c", scored: 3, conceded: 2 },
    ]);
    expect(r.map((x) => x.teamId)).toEqual(["b", "a", "c"]);
    expect(r.map((x) => x.rank)).toEqual([1, 2, 2]);
  });

  it("une équipe sans rencontre apparaît en bas avec 0 joué", () => {
    const r = computeStandings(teams, [{ teamId: "b", scored: 0, conceded: 4 }, { teamId: "a", scored: 1, conceded: 0 }]);
    expect(r.map((x) => x.teamId)).toEqual(["a", "c", "b"]);
    expect(r[1]!.played).toBe(0);
  });

  it("ignore les équipes inconnues", () => {
    expect(computeStandings(teams, [{ teamId: "zzz", scored: 1, conceded: 0 }]).every((x) => x.played === 0)).toBe(true);
  });
});

describe("saisons", () => {
  it("du 1er septembre au 31 août, heure de Paris", () => {
    expect(seasonYearOf(new Date("2026-09-01T00:00:00+02:00"))).toBe(2026);
    expect(seasonYearOf(new Date("2026-08-31T23:59:00+02:00"))).toBe(2025);
    expect(seasonYearOf(new Date("2027-03-10T12:00:00Z"))).toBe(2026);
  });
  it("parseSeason retombe sur la saison en cours", () => {
    expect(parseSeason("2025", 2026)).toBe(2025);
    expect(parseSeason("2030", 2026)).toBe(2026);
    expect(parseSeason("abc", 2026)).toBe(2026);
    expect(parseSeason(undefined, 2026)).toBe(2026);
  });
});
