import { describe, expect, it } from "vitest";
import { POSTER_ROWS_PER_PAGE, TABLE_CODES, paginate, posterHeading, posterScore, startsNewSlot } from "./poster";

describe("paginate", () => {
  it("garde une page vide quand il n'y a aucun match", () => {
    expect(paginate([])).toEqual([[]]);
  });
  it("coupe à la taille d'une page, la dernière page garde le reste", () => {
    const rows = Array.from({ length: POSTER_ROWS_PER_PAGE * 2 + 3 }, (_, i) => i);
    const pages = paginate(rows);
    expect(pages.map((p) => p.length)).toEqual([POSTER_ROWS_PER_PAGE, POSTER_ROWS_PER_PAGE, 3]);
    expect(pages.flat()).toEqual(rows);
  });
  it("un nombre rond de lignes ne crée pas de page vide", () => {
    expect(paginate([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });
});

describe("posterHeading", () => {
  it("« Résultats du » seulement quand tous les matchs ont un score", () => {
    expect(posterHeading([{ done: true }, { done: true }])).toBe("Résultats du");
    expect(posterHeading([{ done: true }, { done: false }])).toBe("Matchs du");
    expect(posterHeading([])).toBe("Matchs du");
  });
});

describe("startsNewSlot", () => {
  it("détecte le changement de créneau, jamais sur la première ligne", () => {
    const rows = [{ timeKey: "09:00" }, { timeKey: "09:00" }, { timeKey: "10:30" }];
    expect([0, 1, 2].map((i) => startsNewSlot(rows, i))).toEqual([false, false, true]);
  });
});

describe("posterScore", () => {
  it.each([
    [{ outcome: null, sets: "" }, ""],
    [{ outcome: "COMPLETED", sets: "6-4 7-5" }, "6/4 7/5"],
    [{ outcome: "COMPLETED", sets: "" }, ""],
    [{ outcome: "WALKOVER", sets: "" }, "WO"],
    [{ outcome: "RETIRED", sets: "6-4 3-2" }, "6/4 3/2 ab."],
    [{ outcome: "RETIRED", sets: "" }, "ab."],
    [{ outcome: "NOT_PLAYED", sets: "" }, ""],
  ] as const)("%j → %s", (input, expected) => {
    expect(posterScore(input)).toBe(expected);
  });
});

describe("légende", () => {
  it("contient les sigles de la fiche", () => {
    expect(TABLE_CODES).toEqual(expect.arrayContaining(["SM", "SD", "CSSM", "FT4SD", "TFDoubles"]));
    expect(TABLE_CODES).toHaveLength(12);
  });
});
