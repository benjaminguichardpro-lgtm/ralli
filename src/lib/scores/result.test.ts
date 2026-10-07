import { describe, expect, it } from "vitest";
import { type MatchResult, ScoreError, formatSets, parseSets, validateResult } from "./result";

const done = (winnerSide: "HOME" | "AWAY", sets: string): MatchResult => ({ outcome: "COMPLETED", winnerSide, sets: parseSets(sets) });

describe("parseSets", () => {
  it("lit des sets séparés par espaces, virgules ou points-virgules", () => {
    expect(parseSets("6-4 3-6")).toEqual([{ home: 6, away: 4 }, { home: 3, away: 6 }]);
    expect(parseSets("6-4, 3-6; 7-5")).toHaveLength(3);
    expect(parseSets("  ")).toEqual([]);
  });
  it("marque le troisième set à 10 points comme super tie-break", () => {
    expect(parseSets("6-4 3-6 10-8")[2]).toEqual({ home: 10, away: 8, superTiebreak: true });
    expect(parseSets("6-4 3-6 6-3")[2]).toEqual({ home: 6, away: 3 });
  });
  it("refuse le texte illisible et plus de trois sets", () => {
    for (const bad of ["6/4", "abc", "6-4-2", "6-", "123-4"]) expect(() => parseSets(bad)).toThrow(ScoreError);
    expect(() => parseSets("6-4 6-4 6-4 6-4")).toThrow("Trois sets au maximum");
  });
  it("formatSets est l'inverse", () => {
    expect(formatSets(parseSets("6-4 3-6 10-8"))).toBe("6-4 3-6 10-8");
  });
});

describe("validateResult : joué jusqu'au bout", () => {
  it.each([
    ["HOME", "6-4 6-3"],
    ["AWAY", "4-6 3-6"],
    ["HOME", "6-4 3-6 10-8"],
    ["AWAY", "7-5 3-6 6-7"],
    ["HOME", "7-6 6-0"],
  ] as const)("accepte %s %s", (w, sets) => {
    expect(validateResult(done(w, sets)).winnerSide).toBe(w);
  });
  it("accepte un score sans aucun set", () => {
    expect(validateResult(done("HOME", ""))).toEqual({ outcome: "COMPLETED", winnerSide: "HOME", sets: [] });
  });
  it("refuse un vainqueur absent ou contraire aux sets", () => {
    expect(() => validateResult({ outcome: "COMPLETED", winnerSide: null, sets: [] })).toThrow("Indiquez le vainqueur");
    expect(() => validateResult(done("AWAY", "6-4 6-3"))).toThrow("ne correspond pas");
  });
  it("refuse un seul set, des sets sans vainqueur et les valeurs absurdes", () => {
    expect(() => validateResult(done("HOME", "6-4"))).toThrow("2 ou 3 sets");
    expect(() => validateResult(done("HOME", "6-4 4-6"))).toThrow("Les sets ne donnent pas de vainqueur");
    expect(() => validateResult(done("HOME", "20-0 6-3"))).toThrow("improbable");
    expect(() => validateResult(done("HOME", "6-6 6-3"))).toThrow("improbable");
    expect(() => validateResult(done("HOME", "6-4 3-6 10-9"))).toThrow("Super tie-break improbable");
    expect(() => validateResult(done("HOME", "3-2 6-3"))).toThrow("improbable");
  });
  it("refuse un super tie-break hors du troisième set", () => {
    expect(() => validateResult({ outcome: "COMPLETED", winnerSide: "HOME", sets: [{ home: 10, away: 8, superTiebreak: true }, { home: 6, away: 4 }] })).toThrow("troisième set");
  });
});

describe("validateResult : autres issues", () => {
  it("abandon et WO : vainqueur obligatoire, sets libres", () => {
    expect(validateResult({ outcome: "RETIRED", winnerSide: "AWAY", sets: parseSets("6-3 2-1") }).winnerSide).toBe("AWAY");
    expect(validateResult({ outcome: "WALKOVER", winnerSide: "HOME", sets: [] }).sets).toEqual([]);
    expect(() => validateResult({ outcome: "RETIRED", winnerSide: null, sets: [] })).toThrow("Indiquez le vainqueur");
    expect(() => validateResult({ outcome: "WALKOVER", winnerSide: null, sets: [] })).toThrow("Indiquez le vainqueur");
  });
  it("non joué : ni vainqueur ni sets", () => {
    expect(validateResult({ outcome: "NOT_PLAYED", winnerSide: null, sets: [] })).toEqual({ outcome: "NOT_PLAYED", winnerSide: null, sets: [] });
    expect(() => validateResult({ outcome: "NOT_PLAYED", winnerSide: "HOME", sets: [] })).toThrow("ni vainqueur ni score");
    expect(() => validateResult({ outcome: "NOT_PLAYED", winnerSide: null, sets: parseSets("6-4 6-4") })).toThrow("ni vainqueur ni score");
  });
});
