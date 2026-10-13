import { describe, expect, it } from "vitest";
import { clubMatchesFilters, clubMatchesQuery, directoryHref, normalizeSearch, parseClubFilters } from "./search";

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

describe("filtres de l'annuaire", () => {
  const none = { region: null, size: null, upcomingOnly: false } as const;
  const lyon = { region: "Auvergne-Rhône-Alpes", licenseeCount: 250, hasUpcoming: true };
  it("sans filtre, tout passe", () => {
    expect(clubMatchesFilters({ region: null, licenseeCount: null, hasUpcoming: false }, none)).toBe(true);
  });
  it("région, taille et rencontre à venir se cumulent", () => {
    expect(clubMatchesFilters(lyon, { ...none, region: "Auvergne-Rhône-Alpes" })).toBe(true);
    expect(clubMatchesFilters(lyon, { ...none, region: "Bretagne" })).toBe(false);
    expect(clubMatchesFilters(lyon, { ...none, size: "medium" })).toBe(true);
    expect(clubMatchesFilters(lyon, { ...none, size: "large" })).toBe(false);
    expect(clubMatchesFilters({ ...lyon, hasUpcoming: false }, { ...none, upcomingOnly: true })).toBe(false);
    expect(clubMatchesFilters(lyon, { region: "Auvergne-Rhône-Alpes", size: "medium", upcomingOnly: true })).toBe(true);
    expect(clubMatchesFilters(lyon, { region: "Auvergne-Rhône-Alpes", size: "small", upcomingOnly: true })).toBe(false);
  });
  it("un club sans région ou sans licenciés ne passe pas le filtre correspondant", () => {
    expect(clubMatchesFilters({ ...lyon, region: null }, { ...none, region: "Bretagne" })).toBe(false);
    expect(clubMatchesFilters({ ...lyon, licenseeCount: null }, { ...none, size: "small" })).toBe(false);
  });
  it("lecture de l'adresse : valeurs inconnues ignorées", () => {
    expect(parseClubFilters({ region: "Bretagne", taille: "large", avenir: "1" })).toEqual({ region: "Bretagne", size: "large", upcomingOnly: true });
    expect(parseClubFilters({ region: "Atlantide", taille: "geant", avenir: "oui" })).toEqual(none);
    expect(parseClubFilters({})).toEqual(none);
  });
  it("directoryHref garde la recherche et les filtres actifs", () => {
    expect(directoryHref("/clubs/carte", "", none)).toBe("/clubs/carte");
    expect(directoryHref("/clubs/carte", " lyon ", { region: "Île-de-France", size: "small", upcomingOnly: true })).toBe("/clubs/carte?q=lyon&region=%C3%8Ele-de-France&taille=small&avenir=1");
  });
});
