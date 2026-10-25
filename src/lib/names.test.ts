import { describe, expect, it } from "vitest";
import { publicPlayerName, visitorPlayerName } from "./names";

describe("publicPlayerName", () => {
  it.each([
    ["Léa", "Martin", "Léa Martin"],
    ["Jean-Pierre", "dupont", "Jean-Pierre dupont"],
    ["Hugo", "de la Tour", "Hugo de la Tour"],
    ["  Zoé ", " Élan  ", "Zoé Élan"],
  ])("%s %s → %s", (first, last, expected) => {
    expect(publicPlayerName(first, last)).toBe(expected);
  });

  it("garde un nom seul si l'autre partie est vide", () => {
    expect(publicPlayerName("Léa", " ")).toBe("Léa");
  });
});

describe("visitorPlayerName", () => {
  it.each([
    ["Léa", "Martin", "Léa M."],
    ["Jean-Pierre", "dupont", "Jean-Pierre D."],
    ["Hugo", "de la Tour", "Hugo D."],
    ["  Zoé ", " élan  ", "Zoé É."],
  ])("%s %s → %s", (first, last, expected) => {
    expect(visitorPlayerName(first, last)).toBe(expected);
  });

  it("ne montre jamais le nom de famille en entier", () => {
    expect(visitorPlayerName("Léa", "Martin")).not.toContain("Martin");
  });

  it("garde le prénom seul si le nom est vide", () => {
    expect(visitorPlayerName("Léa", " ")).toBe("Léa");
  });
});
