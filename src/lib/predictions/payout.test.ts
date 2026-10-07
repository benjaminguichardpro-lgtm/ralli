import { describe, expect, it } from "vitest";
import { computePayout } from "./payout";

describe("computePayout", () => {
  it("cas simple : 100 Aces à 1,56 → 156", () => {
    expect(computePayout(100, 156)).toBe(156);
  });

  it("demi exact arrondi vers le haut : 10 × 1,05 = 10,5 → 11", () => {
    expect(computePayout(10, 105)).toBe(11);
  });

  it("autre demi exact : 50 × 1,01 = 50,5 → 51", () => {
    expect(computePayout(50, 101)).toBe(51);
  });

  it("arrondis au plus proche : 11 × 1,45 = 15,95 → 16 ; 13 × 1,15 = 14,95 → 15 ; 10 × 1,04 = 10,4 → 10", () => {
    expect(computePayout(11, 145)).toBe(16);
    expect(computePayout(13, 115)).toBe(15);
    expect(computePayout(10, 104)).toBe(10);
  });

  it("bornes de cote : 1,00 rend la somme engagée, 10,00 la multiplie par 10", () => {
    expect(computePayout(37, 100)).toBe(37);
    expect(computePayout(37, 1000)).toBe(370);
  });

  it("cote réelle extrême du modèle : 10 × 8,33 = 83,3 → 83", () => {
    expect(computePayout(10, 833)).toBe(83);
  });

  it("refuse les entrées invalides", () => {
    expect(() => computePayout(9, 150)).toThrow(RangeError);
    expect(() => computePayout(10.5, 150)).toThrow(RangeError);
    expect(() => computePayout(10, 99)).toThrow(RangeError);
    expect(() => computePayout(10, 1001)).toThrow(RangeError);
    expect(() => computePayout(10, 1.5)).toThrow(RangeError);
    expect(() => computePayout(Number.MAX_SAFE_INTEGER, 1000)).toThrow(RangeError);
  });

  it("ne passe jamais par un flottant : égal à la formule entière de référence sur une grille", () => {
    for (let c = 10; c <= 500; c += 7) {
      for (let o = 100; o <= 1000; o += 13) {
        const ref = Math.floor((c * o + 50) / 100);
        expect(computePayout(c, o)).toBe(ref);
      }
    }
  });
});
