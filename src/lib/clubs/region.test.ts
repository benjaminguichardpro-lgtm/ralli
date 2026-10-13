import { describe, expect, it } from "vitest";
import { REGIONS, isRegion, regionFromPostalCode } from "./region";

describe("région d'un code postal", () => {
  it("métropole : le département donne la région", () => {
    expect(regionFromPostalCode("69003")).toBe("Auvergne-Rhône-Alpes");
    expect(regionFromPostalCode("75008")).toBe("Île-de-France");
    expect(regionFromPostalCode("33000")).toBe("Nouvelle-Aquitaine");
    expect(regionFromPostalCode("13002")).toBe("Provence-Alpes-Côte d'Azur");
    expect(regionFromPostalCode("01000")).toBe("Auvergne-Rhône-Alpes");
    expect(regionFromPostalCode("35000")).toBe("Bretagne");
  });
  it("Corse : 200xx à 206xx", () => {
    expect(regionFromPostalCode("20000")).toBe("Corse");
    expect(regionFromPostalCode("20200")).toBe("Corse");
    expect(regionFromPostalCode("20600")).toBe("Corse");
    expect(regionFromPostalCode("20700")).toBeNull();
  });
  it("outre-mer : trois premiers chiffres", () => {
    expect(regionFromPostalCode("97100")).toBe("Guadeloupe");
    expect(regionFromPostalCode("97200")).toBe("Martinique");
    expect(regionFromPostalCode("97300")).toBe("Guyane");
    expect(regionFromPostalCode("97400")).toBe("La Réunion");
    expect(regionFromPostalCode("97600")).toBe("Mayotte");
    expect(regionFromPostalCode("98000")).toBeNull();
  });
  it("code absent, mal formé ou inconnu : null ; les espaces sont ignorés", () => {
    expect(regionFromPostalCode(null)).toBeNull();
    expect(regionFromPostalCode("")).toBeNull();
    expect(regionFromPostalCode("6900")).toBeNull();
    expect(regionFromPostalCode("ABCDE")).toBeNull();
    expect(regionFromPostalCode("00000")).toBeNull();
    expect(regionFromPostalCode("69 003")).toBe("Auvergne-Rhône-Alpes");
  });
  it("chaque département de métropole (01 à 95, hors 20) a une région", () => {
    for (let d = 1; d <= 95; d++) {
      if (d === 20) continue;
      const code = `${String(d).padStart(2, "0")}000`;
      expect(regionFromPostalCode(code), code).not.toBeNull();
    }
  });
  it("toutes les régions de la liste sont atteignables, isRegion reconnaît la liste", () => {
    const reached = new Set(["69000", "21000", "35000", "45000", "20000", "67000", "59000", "75000", "76000", "33000", "31000", "44000", "13000", "97100", "97200", "97300", "97400", "97600"].map(regionFromPostalCode));
    for (const r of REGIONS) expect(reached.has(r), r).toBe(true);
    expect(isRegion("Bretagne")).toBe(true);
    expect(isRegion("Atlantide")).toBe(false);
  });
});
