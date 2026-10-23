import { describe, expect, it } from "vitest";
import {
  changePasswordSchema,
  displayNameKey,
  loginLookup,
  signUpFormSchema,
  signUpSchema,
} from "./account";

const valid = { email: "  Alice@Club.FR ", displayName: " Alice  B ", password: "Motdepasse-2026!" };

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
    ["mot de passe trop court", { password: "Abcdef-12" }],
    ["mot de passe sans majuscule", { password: "motdepasse-2026!" }],
    ["mot de passe sans symbole", { password: "Motdepasse2026" }],
    ["mot de passe > 72 octets", { password: "É-" + "é".repeat(36) }],
    ["email invalide", { email: "pas-un-email" }],
    ["pseudo trop court", { displayName: "ab" }],
    ["pseudo trop long", { displayName: "a".repeat(21) }],
    ["pseudo avec caractère interdit", { displayName: "alice<script>" }],
  ])("refuse : %s", (_, patch) => {
    expect(signUpSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });

  it("accepte 10 caractères avec une majuscule et un symbole, accentués ou non", () => {
    for (const password of ["Abcdefgh-1", "Éléphant_rose", "Tennis club!", "Zz?zzzzzzz"]) expect(signUpSchema.safeParse({ ...valid, password }).success, password).toBe(true);
  });

  it("accepte les accents et les chiffres dans le pseudo", () => {
    expect(signUpSchema.safeParse({ ...valid, displayName: "Zoé_75-Élan" }).success).toBe(true);
  });
});

describe("signUpFormSchema (avec confirmation)", () => {
  it("exige la même saisie deux fois", () => {
    expect(signUpFormSchema.safeParse({ ...valid, confirm: valid.password }).success).toBe(true);
    const r = signUpFormSchema.safeParse({ ...valid, confirm: "Autre-mot-de-passe-1!" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["confirm"]);
  });
});

describe("displayNameKey", () => {
  it("est insensible à la casse", () => {
    expect(displayNameKey("Zoé")).toBe(displayNameKey("ZOÉ"));
  });
});

describe("changePasswordSchema", () => {
  it("exige deux saisies identiques", () => {
    expect(changePasswordSchema.safeParse({ password: "Nouveaumdp-1!", confirm: "autre" }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ password: "Nouveaumdp-1!", confirm: "Nouveaumdp-1!" }).success).toBe(true);
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
