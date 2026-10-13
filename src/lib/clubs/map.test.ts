import { describe, expect, it } from "vitest";
import { followersLabel, toMapClubs } from "./map";

const base = { id: "c1", name: "TC Lyon", city: "Lyon", postalCode: "69003", followers: 12 };

describe("clubs de la carte", () => {
  it("seuls les clubs localisés ont une épingle", () => {
    const out = toMapClubs([
      { ...base, latitude: 45.75, longitude: 4.85 },
      { ...base, id: "c2", latitude: null, longitude: null },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "c1", latitude: 45.75, longitude: 4.85, place: "69003 Lyon", followersLabel: "12 personnes suivent ce club" });
  });
  it("0 est une latitude valide", () => {
    expect(toMapClubs([{ ...base, latitude: 0, longitude: 0 }])).toHaveLength(1);
  });
  it("compteur au singulier et à zéro", () => {
    expect(followersLabel(1)).toBe("1 personne suit ce club");
    expect(followersLabel(0)).toBe("Sois le premier à suivre ce club");
  });
});
