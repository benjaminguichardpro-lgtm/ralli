import { describe, expect, it } from "vitest";
import { afterAuthPath, clubPath, parseClubParam } from "./invite-link";

const ID = "cmgx1abc2def3ghi4jkl5mno6";

describe("lien vers la page d'un club", () => {
  it("construit l'adresse à partir de l'identifiant", () => {
    expect(clubPath(ID)).toBe(`/clubs/${ID}`);
  });

  it("accepte un identifiant bien formé", () => {
    expect(parseClubParam(` ${ID} `)).toBe(ID);
  });

  it("refuse tout le reste (adresse, majuscules, trop court, tableau, vide)", () => {
    for (const bad of ["//evil.com", "https://evil.com", "ABC234", "c123", "", undefined, null, [ID]]) {
      expect(parseClubParam(bad as never)).toBeNull();
    }
  });

  it("ne redirige jamais ailleurs que vers /clubs/<id> ou l'accueil", () => {
    expect(afterAuthPath(ID)).toBe(`/clubs/${ID}`);
    expect(afterAuthPath("https://evil.com")).toBe("/");
    expect(afterAuthPath(undefined)).toBe("/");
  });
});
