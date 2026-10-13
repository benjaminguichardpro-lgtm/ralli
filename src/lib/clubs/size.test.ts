import { describe, expect, it } from "vitest";
import { clubSize, isClubSize } from "./size";

describe("taille d'un club", () => {
  it("petit jusqu'à 99, moyen de 100 à 299, grand à partir de 300", () => {
    expect(clubSize(0)).toBe("small");
    expect(clubSize(99)).toBe("small");
    expect(clubSize(100)).toBe("medium");
    expect(clubSize(299)).toBe("medium");
    expect(clubSize(300)).toBe("large");
    expect(clubSize(5000)).toBe("large");
  });
  it("licenciés non renseignés : aucune taille", () => {
    expect(clubSize(null)).toBeNull();
  });
  it("isClubSize", () => {
    expect(isClubSize("medium")).toBe(true);
    expect(isClubSize("enorme")).toBe(false);
  });
});
