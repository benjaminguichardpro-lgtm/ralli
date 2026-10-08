import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ALLOWED_PAIRS, contrastRatio, parseThemeColors } from "./contrast";

const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8");
const colors = parseThemeColors(css);

describe("contrastRatio", () => {
  it("noir sur blanc = 21", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
  });
  it("est symétrique", () => {
    expect(contrastRatio("#17503a", "#f3f7f3")).toBeCloseTo(contrastRatio("#f3f7f3", "#17503a"), 10);
  });
});

describe("thème Ralli", () => {
  it("contient les couleurs du brief", () => {
    expect(colors).toMatchObject({
      primary: "#17503a",
      brand: "#1c5b3c",
      accent: "#9a6f12",
      gold: "#e6c872",
      pale: "#e2efe5",
      canvas: "#f3f7f3",
      success: "#2b7a4b",
      surface: "#ffffff",
    });
  });

  it.each(ALLOWED_PAIRS)("$usage ($fg sur $bg) respecte AA", ({ fg, bg, min }) => {
    const f = colors[fg];
    const b = colors[bg];
    expect(f, `token ${fg} absent`).toBeDefined();
    expect(b, `token ${bg} absent`).toBeDefined();
    expect(contrastRatio(f!, b!)).toBeGreaterThanOrEqual(min);
  });
});
