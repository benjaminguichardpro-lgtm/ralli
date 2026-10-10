import { describe, expect, it } from "vitest";
import {
  changePasswordSchema,
  displayNameKey,
  inviteCodeInputSchema,
  loginLookup,
  signUpSchema,
} from "./account";

const valid = { email: "  Alice@Club.FR ", displayName: " Alice  B ", password: "motdepasse" };

describe("signUpSchema", () => {
  it("normalise l'email et le pseudo", () => {
    const r = signUpSchema.parse(valid);
    expect(r.email).toBe("alice@club.fr");
    expect(r.displayName).toBe("Alice B");
  });

  it("n'exige aucune déclaration d'âge", () => {
    expect(signUpSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ["mot de passe trop court", { password: "1234567" }],
    ["mot de passe > 72 octets", { password: "é".repeat(37) }],
    ["email invalide", { email: "pas-un-email" }],
    ["pseudo trop court", { displayName: "ab" }],
    ["pseudo trop long", { displayName: "a".repeat(21) }],
    ["pseudo avec caractère interdit", { displayName: "alice<script>" }],
  ])("refuse : %s", (_, patch) => {
    expect(signUpSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });

  it("accepte les accents et les chiffres dans le pseudo", () => {
    expect(signUpSchema.safeParse({ ...valid, displayName: "Zoé_75-Élan" }).success).toBe(true);
  });
});

describe("displayNameKey", () => {
  it("est insensible à la casse", () => {
    expect(displayNameKey("Zoé")).toBe(displayNameKey("ZOÉ"));
  });
});

describe("changePasswordSchema", () => {
  it("exige deux saisies identiques", () => {
    expect(changePasswordSchema.safeParse({ password: "nouveaumdp", confirm: "autre" }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ password: "nouveaumdp", confirm: "nouveaumdp" }).success).toBe(true);
  });
});

describe("inviteCodeInputSchema", () => {
  it("met en majuscules et retire les espaces", () => {
    expect(inviteCodeInputSchema.parse(" ab3k9z ")).toBe("AB3K9Z");
  });
  it("refuse une longueur incorrecte", () => {
    expect(inviteCodeInputSchema.safeParse("ABC").success).toBe(false);
  });
});

describe("loginLookup (email ou pseudo)", () => {
  it("reconnaît un email (normalisé) et un pseudo (clé insensible à la casse)", () => {
    expect(loginLookup(" Alice@Club.FR ")).toEqual({ email: "alice@club.fr" });
    expect(loginLookup("Alice Dupont")).toEqual({ displayNameKey: "alice dupont" });
    expect(loginLookup("  ALICE   dupont ")).toEqual({ displayNameKey: "alice dupont" });
  });
  it("renvoie null pour ce qui n'est ni l'un ni l'autre", () => {
    for (const bad of ["", "   ", "a@", "@b.fr", "pas un email@", "x", "a".repeat(30), "bob<script>"]) expect(loginLookup(bad), bad).toBeNull();
  });
});
