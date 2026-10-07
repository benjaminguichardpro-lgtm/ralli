import { describe, expect, it } from "vitest";
import { INVITE_CODE_ALPHABET, generateInviteCode, isWellFormedInviteCode } from "./invite-code";

describe("generateInviteCode", () => {
  it("produit 6 caractères de l'alphabet, sans 0/O/1/I", () => {
    for (let i = 0; i < 500; i++) {
      const code = generateInviteCode();
      expect(code).toMatch(/^[A-Z0-9]{6}$/);
      expect(code).not.toMatch(/[01OI]/);
      expect(isWellFormedInviteCode(code)).toBe(true);
    }
  });

  it("n'utilise pas les caractères ambigus dans l'alphabet", () => {
    expect(INVITE_CODE_ALPHABET).not.toMatch(/[01OI]/);
  });

  it("varie d'un appel à l'autre", () => {
    const codes = new Set(Array.from({ length: 200 }, generateInviteCode));
    expect(codes.size).toBeGreaterThan(195);
  });
});

describe("isWellFormedInviteCode", () => {
  it("rejette les caractères ambigus et les mauvaises longueurs", () => {
    expect(isWellFormedInviteCode("AB0CDE")).toBe(false);
    expect(isWellFormedInviteCode("ABOCDE")).toBe(false);
    expect(isWellFormedInviteCode("ABCDE")).toBe(false);
    expect(isWellFormedInviteCode("ABCDEFG")).toBe(false);
  });
});
