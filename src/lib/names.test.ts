import { describe, expect, it } from "vitest";
import { publicPlayerName } from "./names";

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
