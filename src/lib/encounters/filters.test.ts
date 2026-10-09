import { describe, expect, it } from "vitest";
import type { EffectiveStatus } from "./state";
import { FILTERS, applyFilter, clubResult, countFilters, parseFilter, resultBadgeText } from "./filters";

describe("résultat pour le club", () => {
  it("à domicile : les points du domicile sont ceux du club", () => {
    expect(clubResult({ home: 3, away: 2 }, true)).toEqual({ kind: "WIN", club: 3, opp: 2 });
    expect(clubResult({ home: 1, away: 3 }, true)).toEqual({ kind: "LOSS", club: 1, opp: 3 });
  });
  it("à l'extérieur : les points de l'extérieur sont ceux du club", () => {
    expect(clubResult({ home: 2, away: 4 }, false)).toEqual({ kind: "WIN", club: 4, opp: 2 });
    expect(clubResult({ home: 5, away: 1 }, false)).toEqual({ kind: "LOSS", club: 1, opp: 5 });
  });
  it("égalité : nul, dans les deux sens ; 0 – 0 aussi", () => {
    expect(clubResult({ home: 3, away: 3 }, true).kind).toBe("DRAW");
    expect(clubResult({ home: 3, away: 3 }, false).kind).toBe("DRAW");
    expect(clubResult({ home: 0, away: 0 }, true).kind).toBe("DRAW");
  });
  it("texte du badge : le club en premier", () => {
    expect(resultBadgeText(clubResult({ home: 2, away: 3 }, false))).toBe("Victoire 3 – 2");
    expect(resultBadgeText(clubResult({ home: 2, away: 3 }, true))).toBe("Défaite 2 – 3");
    expect(resultBadgeText(clubResult({ home: 2, away: 2 }, true))).toBe("Nul 2 – 2");
  });
});

const item = (status: EffectiveStatus, result: ReturnType<typeof clubResult> | null = null) => ({ status, result });
const win = clubResult({ home: 3, away: 1 }, true);
const loss = clubResult({ home: 1, away: 3 }, true);
const draw = clubResult({ home: 2, away: 2 }, true);

const items = [
  item("DRAFT"),
  item("OPEN"),
  item("LOCKED"),
  item("SCORE_PROPOSED"),
  item("DISPUTED"),
  item("CONFIRMED", win),
  item("CONFIRMED", win),
  item("CONFIRMED", loss),
  item("CONFIRMED", draw),
  item("CANCELLED"),
];

describe("filtres de la liste", () => {
  it("compte chaque filtre ; terminées = victoires + défaites + nuls", () => {
    expect(countFilters(items)).toEqual({
      toutes: 10,
      "a-venir": 2,
      "en-cours": 3,
      terminees: 4,
      victoires: 2,
      defaites: 1,
      nuls: 1,
      annulees: 1,
    });
  });

  it("chaque rencontre est dans exactement un des filtres de statut", () => {
    const statusFilters = ["a-venir", "en-cours", "terminees", "annulees"] as const;
    for (const it of items) expect(statusFilters.filter((k) => applyFilter([it], k).length === 1)).toHaveLength(1);
  });

  it("victoire, défaite et nul ne concernent que les rencontres terminées", () => {
    expect(applyFilter(items, "victoires").every((e) => e.status === "CONFIRMED")).toBe(true);
    expect(applyFilter([item("OPEN", win)], "victoires")).toHaveLength(1); // le filtre lit le résultat : seules les terminées en ont un
    expect(applyFilter([item("OPEN")], "victoires")).toHaveLength(0);
  });

  it("« Toutes » garde tout, dans l'ordre", () => {
    expect(applyFilter(items, "toutes")).toEqual(items);
  });

  it("paramètre d'adresse : valeur connue, inconnue, absente ou multiple", () => {
    expect(parseFilter("victoires")).toBe("victoires");
    expect(parseFilter(["defaites", "nuls"])).toBe("defaites");
    expect(parseFilter("n-importe-quoi")).toBe("toutes");
    expect(parseFilter(undefined)).toBe("toutes");
    expect(FILTERS.map((f) => f.key)).toHaveLength(8);
  });
});
