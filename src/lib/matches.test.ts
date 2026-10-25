import { describe, expect, it } from "vitest";
import { numberByKind, pointsLabel, sideName, sortSinglesFirst, tallyPoints } from "./matches";

describe("numérotation et ordre", () => {
  it("numérote simples et doubles séparément", () => {
    const rows = [{ kind: "SINGLES" as const }, { kind: "DOUBLES" as const }, { kind: "SINGLES" as const }, { kind: "DOUBLES" as const }];
    expect(numberByKind(rows).map((r) => `${r.kind}${r.number}`)).toEqual(["SINGLES1", "DOUBLES1", "SINGLES2", "DOUBLES2"]);
  });

  it("met les simples avant les doubles, dans l'ordre de création", () => {
    const rows = [
      { kind: "DOUBLES" as const, order: 1 },
      { kind: "SINGLES" as const, order: 2 },
      { kind: "SINGLES" as const, order: 3 },
      { kind: "DOUBLES" as const, order: 4 },
    ];
    expect(sortSinglesFirst(rows).map((r) => r.order)).toEqual([2, 3, 1, 4]);
  });
});

describe("noms", () => {
  it("un joueur ou une paire, toujours « Prénom Nom »", () => {
    expect(sideName([{ firstName: "Léa", lastName: "Martin" }])).toBe("Léa Martin");
    expect(sideName([{ firstName: "Léa", lastName: "Martin" }, { firstName: "Hugo", lastName: "Durand" }], true)).toBe("Léa M. / Hugo D.");
    expect(sideName([{ firstName: "Léa", lastName: "Martin" }, { firstName: "Hugo", lastName: "Durand" }])).toBe("Léa Martin / Hugo Durand");
  });
});

describe("points du score final", () => {
  it("additionne les points des matchs gagnés ; un match sans vainqueur ne compte pour personne", () => {
    expect(
      tallyPoints([
        { winnerSide: "HOME", points: 1 },
        { winnerSide: "AWAY", points: 1 },
        { winnerSide: "HOME", points: 2 },
        { winnerSide: null, points: 2 },
      ]),
    ).toEqual({ home: 3, away: 1 });
  });
  it("sans match : 0 – 0", () => expect(tallyPoints([])).toEqual({ home: 0, away: 0 }));
  it("libellé", () => {
    expect(pointsLabel(1)).toBe("1 point");
    expect(pointsLabel(2)).toBe("2 points");
  });
});
