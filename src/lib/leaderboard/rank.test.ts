import { describe, expect, it } from "vitest";
import { type PlayerTotals, rankPlayers, selectDisplay, successRate } from "./rank";

const p = (userId: string, displayName: string, net: number, settled: number, wins: number): PlayerTotals => ({ userId, displayName, net, settled, wins });

describe("rankPlayers", () => {
  it("trie par bénéfice décroissant, négatifs en bas", () => {
    const r = rankPlayers([p("a", "Ana", -50, 3, 1), p("b", "Bob", 178, 3, 2), p("c", "Cleo", 0, 3, 0)], 1);
    expect(r.map((x) => x.userId)).toEqual(["b", "c", "a"]);
    expect(r.map((x) => x.rank)).toEqual([1, 2, 3]);
  });

  it("égalité de bénéfice : même rang, puis rang suivant sauté (1, 2, 2, 4)", () => {
    const r = rankPlayers([p("a", "Ana", 100, 3, 2), p("b", "Bob", 40, 3, 1), p("c", "Cleo", 40, 3, 1), p("d", "Dan", -5, 3, 1)], 1);
    expect(r.map((x) => x.rank)).toEqual([1, 2, 2, 4]);
  });

  it("à bénéfice égal : plus de pronostics gagnés d'abord, puis pseudo alphabétique sans tenir compte de la casse", () => {
    const r = rankPlayers([p("a", "zoé", 40, 3, 1), p("b", "Bob", 40, 3, 1), p("c", "Cleo", 40, 4, 2)], 1);
    expect(r.map((x) => x.userId)).toEqual(["c", "b", "a"]);
    expect(r.map((x) => x.rank)).toEqual([1, 1, 1]);
  });

  it("applique le seuil de participation, bornes comprises", () => {
    const players = [p("a", "Ana", 500, 2, 2), p("b", "Bob", 10, 3, 2)];
    expect(rankPlayers(players, 3).map((x) => x.userId)).toEqual(["b"]);
    expect(rankPlayers(players, 3)[0]!.rank).toBe(1); // le rang se calcule parmi les classés
    expect(rankPlayers(players, 2)).toHaveLength(2);
    expect(rankPlayers(players, 4)).toEqual([]);
  });

  it("ne modifie pas l'entrée", () => {
    const players = [p("a", "Ana", 1, 3, 1), p("b", "Bob", 2, 3, 1)];
    rankPlayers(players, 1);
    expect(players.map((x) => x.userId)).toEqual(["a", "b"]);
  });
});

describe("successRate", () => {
  it.each([
    [0, 0, 0],
    [1, 3, 33],
    [2, 3, 67],
    [1, 2, 50],
    [3, 3, 100],
    [0, 4, 0],
  ])("%i gagné(s) sur %i → %i %%", (w, s, pct) => expect(successRate(w, s)).toBe(pct));
});

describe("selectDisplay", () => {
  const ranked = rankPlayers(Array.from({ length: 25 }, (_, i) => p(`u${i}`, `J${String(i).padStart(2, "0")}`, 100 - i, 3, 1)), 1);

  it("garde les 20 premiers", () => {
    const { top, me } = selectDisplay(ranked, "u0", 20);
    expect(top).toHaveLength(20);
    expect(me).toBeNull();
  });
  it("ajoute la ligne du lecteur classé plus bas, avec son vrai rang", () => {
    const { top, me } = selectDisplay(ranked, "u22", 20);
    expect(top.some((r) => r.userId === "u22")).toBe(false);
    expect(me).toMatchObject({ userId: "u22", rank: 23 });
  });
  it("lecteur non classé : pas de ligne", () => {
    expect(selectDisplay(ranked, "absent", 20).me).toBeNull();
  });
  it("le 20e est dans le haut, le 21e dans « me »", () => {
    expect(selectDisplay(ranked, "u19", 20).me).toBeNull();
    expect(selectDisplay(ranked, "u20", 20).me?.rank).toBe(21);
  });
});
