import { describe, expect, it } from "vitest";
import { clubMatchesQuery, normalizeSearch } from "./search";

const club = { name: "TC Évian-les-Bains", city: "Évian-les-Bains", postalCode: "74500" };

describe("recherche de club", () => {
  it("ignore accents, majuscules et espaces en trop", () => {
    expect(normalizeSearch("  ÉVIAN   les Bains ")).toBe("evian les bains");
  });
  it("trouve par nom, ville ou code postal", () => {
    expect(clubMatchesQuery(club, "evian")).toBe(true);
    expect(clubMatchesQuery(club, "TC")).toBe(true);
    expect(clubMatchesQuery(club, "74500")).toBe(true);
    expect(clubMatchesQuery(club, "745")).toBe(true);
  });
  it("tous les mots doivent correspondre, dans n'importe quel ordre", () => {
    expect(clubMatchesQuery(club, "bains evian")).toBe(true);
    expect(clubMatchesQuery(club, "evian lyon")).toBe(false);
  });
  it("recherche vide : tous les clubs ; ville absente : seulement le nom", () => {
    expect(clubMatchesQuery(club, "   ")).toBe(true);
    expect(clubMatchesQuery({ name: "TC Rezé", city: null, postalCode: null }, "reze")).toBe(true);
    expect(clubMatchesQuery({ name: "TC Rezé", city: null, postalCode: null }, "nantes")).toBe(false);
  });
});
