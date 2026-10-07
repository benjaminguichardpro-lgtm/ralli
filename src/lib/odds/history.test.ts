import { describe, expect, it } from "vitest";
import type { MatchOutcome, Side } from "@/generated/prisma/enums";
import { type HistoricalMatch, countsForHistory, headToHead, recentForm } from "./history";

let day = 0;
const m = (home: string, away: string, winner: Side | null, outcome: MatchOutcome = "COMPLETED", order = 1): HistoricalMatch => ({
  homePlayerId: home,
  awayPlayerId: away,
  winnerSide: winner,
  outcome,
  playedAt: new Date(Date.UTC(2026, 0, 1 + day++)),
  order,
});

describe("countsForHistory", () => {
  it("compte les matchs joués et les abandons ; ignore WO et non joués", () => {
    expect(countsForHistory(m("a", "b", "HOME", "COMPLETED"))).toBe(true);
    expect(countsForHistory(m("a", "b", "HOME", "RETIRED"))).toBe(true);
    expect(countsForHistory(m("a", "b", "HOME", "WALKOVER"))).toBe(false);
    expect(countsForHistory(m("a", "b", null, "NOT_PLAYED"))).toBe(false);
  });
});

describe("recentForm", () => {
  it("du plus récent au plus ancien, côté domicile comme extérieur", () => {
    day = 0;
    const matches = [m("a", "x", "HOME"), m("y", "a", "HOME"), m("a", "z", "AWAY"), m("w", "a", "AWAY")];
    // ordre chronologique : W, L, L, W → du plus récent : W, L, L, W
    expect(recentForm("a", matches, 5)).toEqual(["W", "L", "L", "W"]);
  });

  it("limite à la fenêtre et ignore WO / non joués", () => {
    day = 0;
    const matches = [
      m("a", "x", "AWAY"), // le plus ancien : hors fenêtre
      ...Array.from({ length: 5 }, () => m("a", "x", "HOME")),
      m("a", "x", "AWAY", "WALKOVER"),
      m("a", "x", null, "NOT_PLAYED"),
    ];
    expect(recentForm("a", matches, 5)).toEqual(["W", "W", "W", "W", "W"]);
  });

  it("ordre des matchs d'une même rencontre : le numéro départage", () => {
    const d = new Date(Date.UTC(2026, 5, 1));
    const matches: HistoricalMatch[] = [
      { homePlayerId: "a", awayPlayerId: "x", winnerSide: "HOME", outcome: "COMPLETED", playedAt: d, order: 1 },
      { homePlayerId: "a", awayPlayerId: "y", winnerSide: "AWAY", outcome: "COMPLETED", playedAt: d, order: 3 },
    ];
    expect(recentForm("a", matches, 5)).toEqual(["L", "W"]);
  });

  it("aucun historique : liste vide", () => {
    expect(recentForm("a", [], 5)).toEqual([]);
  });
});

describe("headToHead", () => {
  it("compte les victoires de chacun, quel que soit le côté", () => {
    day = 0;
    const matches = [m("a", "b", "HOME"), m("b", "a", "HOME"), m("b", "a", "AWAY"), m("a", "c", "HOME"), m("a", "b", "HOME", "WALKOVER")];
    expect(headToHead("a", "b", matches)).toEqual({ winsA: 2, winsB: 1 });
    expect(headToHead("b", "a", matches)).toEqual({ winsA: 1, winsB: 2 });
  });

  it("aucune confrontation", () => {
    expect(headToHead("a", "b", [m("a", "c", "HOME")])).toEqual({ winsA: 0, winsB: 0 });
  });
});
