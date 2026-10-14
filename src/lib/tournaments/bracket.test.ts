import { describe, expect, it } from "vitest";
import { isDrawSize, isFinal, matchRoundName, matchesInRound, nextSlot, roundCount, roundName } from "./bracket";

describe("tableau", () => {
  it("tailles autorisées : 4, 8, 16, 32", () => {
    for (const n of [4, 8, 16, 32]) expect(isDrawSize(n)).toBe(true);
    for (const n of [0, 2, 6, 12, 64]) expect(isDrawSize(n)).toBe(false);
  });

  it("nombre de tours et de matchs : N − 1 matchs au total", () => {
    for (const n of [4, 8, 16, 32]) {
      let total = 0;
      for (let r = 1; r <= roundCount(n); r++) total += matchesInRound(n, r);
      expect(total).toBe(n - 1);
      expect(matchesInRound(n, roundCount(n))).toBe(1); // une seule finale
    }
    expect(roundCount(16)).toBe(4);
    expect(matchesInRound(16, 1)).toBe(8);
  });

  it("noms des tours, comptés depuis la finale", () => {
    expect([1, 2, 3].map((r) => roundName(8, r))).toEqual(["Quarts de finale", "Demi-finales", "Finale"]);
    expect([1, 2].map((r) => roundName(4, r))).toEqual(["Demi-finales", "Finale"]);
    expect([1, 2, 3, 4, 5].map((r) => roundName(32, r))).toEqual(["Seizièmes de finale", "Huitièmes de finale", "Quarts de finale", "Demi-finales", "Finale"]);
    expect(matchRoundName(8, 2)).toBe("Demi-finale");
  });

  it("le vainqueur avance : positions 0 et 1 → match 0 (domicile, extérieur) ; 2 et 3 → match 1 ; pas de suite après la finale", () => {
    expect(nextSlot(8, 1, 0)).toEqual({ round: 2, position: 0, side: "HOME" });
    expect(nextSlot(8, 1, 1)).toEqual({ round: 2, position: 0, side: "AWAY" });
    expect(nextSlot(8, 1, 2)).toEqual({ round: 2, position: 1, side: "HOME" });
    expect(nextSlot(8, 1, 3)).toEqual({ round: 2, position: 1, side: "AWAY" });
    expect(nextSlot(8, 2, 1)).toEqual({ round: 3, position: 0, side: "AWAY" });
    expect(nextSlot(8, 3, 0)).toBeNull();
    expect(isFinal(8, 3)).toBe(true);
    expect(isFinal(8, 2)).toBe(false);
  });
});
