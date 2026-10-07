import { describe, expect, it } from "vitest";
import { publicPlayerName } from "./names";

describe("publicPlayerName", () => {
  it.each([
    ["Léa", "Martin", "Léa M."],
    ["Jean-Pierre", "dupont", "Jean-Pierre D."],
    ["Hugo", "de la Tour", "Hugo D."],
    ["Zoé", "Élan", "Zoé É."],
    ["Paul", "'t Hooft", "Paul T."],
  ])("%s %s → %s", (first, last, expected) => {
    expect(publicPlayerName(first, last)).toBe(expected);
  });

  it("ne contient jamais le nom complet", () => {
    expect(publicPlayerName("Léa", "Martin")).not.toContain("Martin");
  });
});
