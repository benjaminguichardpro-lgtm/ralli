import { describe, expect, it } from "vitest";
import { predictorCountLabel } from "./labels";

describe("nombre de membres qui ont pronostiqué", () => {
  it("rien à zéro (ou négatif)", () => {
    expect(predictorCountLabel(0)).toBeNull();
    expect(predictorCountLabel(-3)).toBeNull();
  });
  it("singulier et pluriel accordés", () => {
    expect(predictorCountLabel(1)).toBe("1 membre a pronostiqué");
    expect(predictorCountLabel(2)).toBe("2 membres ont pronostiqué");
    expect(predictorCountLabel(12)).toBe("12 membres ont pronostiqué");
  });
  it("séparateur de milliers fin", () => {
    expect(predictorCountLabel(1250)?.replace(/\s/g, " ")).toBe("1 250 membres ont pronostiqué");
  });
  it("jamais de mot interdit", () => {
    for (const n of [1, 2, 30]) expect(predictorCountLabel(n)).not.toMatch(/pari|mise|bookmaker/i);
  });
});
