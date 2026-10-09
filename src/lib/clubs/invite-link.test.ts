import { describe, expect, it } from "vitest";
import { afterAuthPath, invitePath, parseInviteParam } from "./invite-link";

describe("lien d'invitation", () => {
  it("construit l'adresse à partir du code", () => {
    expect(invitePath("ABC234")).toBe("/rejoindre/ABC234");
  });

  it("accepte un code bien formé, quelle que soit la casse", () => {
    expect(parseInviteParam("abc234")).toBe("ABC234");
    expect(parseInviteParam(" ABC234 ")).toBe("ABC234");
  });

  it("refuse tout le reste (0/O/1/I, longueur, tableau, vide)", () => {
    for (const bad of ["AB0234", "ABC23", "ABC2345", "", undefined, null, ["ABC234"], "//evil.com"]) {
      expect(parseInviteParam(bad as never)).toBeNull();
    }
  });

  it("ne redirige jamais ailleurs que vers /rejoindre/CODE ou l'accueil", () => {
    expect(afterAuthPath("abc234")).toBe("/rejoindre/ABC234");
    expect(afterAuthPath("https://evil.com")).toBe("/");
    expect(afterAuthPath(undefined)).toBe("/");
  });
});
