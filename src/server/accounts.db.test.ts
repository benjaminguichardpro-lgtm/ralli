import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { signUpSchema } from "@/lib/validation/account";
import { authenticate, changePassword, registerUser, resetPasswordByEmail } from "./accounts";
import { getBalance } from "./ledger";

const input = (patch: Record<string, string> = {}) =>
  signUpSchema.parse({ email: "alice@club.fr", displayName: "Alice", password: "motdepasse", ...patch });

describe("registerUser", () => {
  it("crée le compte et crédite 1000 Aces via le ledger", async () => {
    const { id } = await registerUser(input());
    const user = await db.user.findUniqueOrThrow({ where: { id } });
    expect(user.passwordHash).not.toContain("motdepasse");
    expect(await getBalance(id)).toBe(1000);
    const entries = await db.ledgerEntry.findMany({ where: { userId: id } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ type: "SIGNUP_BONUS", amount: 1000, idempotencyKey: `signup:${id}` });
  });

  it("refuse un email déjà utilisé, quelle que soit la casse saisie", async () => {
    await registerUser(input());
    await expect(registerUser(input({ email: "ALICE@club.fr", displayName: "Autre" }))).rejects.toMatchObject({
      code: "EMAIL_TAKEN",
    });
  });

  it("refuse un pseudo déjà pris, insensible à la casse", async () => {
    await registerUser(input());
    await expect(registerUser(input({ email: "b@club.fr", displayName: "ALICE" }))).rejects.toMatchObject({
      code: "DISPLAY_NAME_TAKEN",
    });
  });
});

describe("authenticate", () => {
  it("accepte les bons identifiants et refuse les autres sans distinguer la cause", async () => {
    const { id } = await registerUser(input());
    expect(await authenticate("alice@club.fr", "motdepasse")).toEqual({ id });
    expect(await authenticate("alice@club.fr", "mauvais")).toBeNull();
    expect(await authenticate("inconnu@club.fr", "motdepasse")).toBeNull();
  });
});

describe("authenticate par pseudo ou par email", () => {
  it("accepte le pseudo sans tenir compte de la casse ni des espaces autour, et l'email en majuscules", async () => {
    const { id } = await registerUser(input({ displayName: "Alice Dupont" }));
    for (const ident of ["Alice Dupont", "alice dupont", "ALICE DUPONT", "  Alice   Dupont ", "alice@club.fr", "ALICE@Club.fr"]) {
      expect(await authenticate(ident, "motdepasse"), ident).toEqual({ id });
      expect(await authenticate(ident, "mauvais"), ident).toBeNull();
    }
  });

  it("refuse l'inconnu, le vide et le pseudo d'un autre compte avec le mauvais mot de passe", async () => {
    await registerUser(input());
    await registerUser(input({ email: "bob@club.fr", displayName: "Bob", password: "autremotdepasse" }));
    expect(await authenticate("Inconnu", "motdepasse")).toBeNull();
    expect(await authenticate("", "motdepasse")).toBeNull();
    expect(await authenticate("   ", "motdepasse")).toBeNull();
    expect(await authenticate("bob@inconnu.fr", "autremotdepasse")).toBeNull();
    expect(await authenticate("Bob", "motdepasse")).toBeNull(); // mot de passe d'Alice
    expect((await authenticate("Bob", "autremotdepasse"))?.id).toBeTruthy();
  });

  it("le pseudo ne peut pas être confondu avec un email : « @ » est interdit dans un pseudo", async () => {
    await registerUser(input());
    expect(await authenticate("alice@", "motdepasse")).toBeNull();
    expect(await authenticate("@club.fr", "motdepasse")).toBeNull();
  });
});

describe("resetPasswordByEmail / changePassword", () => {
  it("pose un mot de passe temporaire, force le changement, puis le lève", async () => {
    const { id } = await registerUser(input());
    const { temporaryPassword } = await resetPasswordByEmail("alice@club.fr");
    expect(temporaryPassword).toHaveLength(12);
    expect(await authenticate("alice@club.fr", "motdepasse")).toBeNull();
    expect(await authenticate("alice@club.fr", temporaryPassword)).toEqual({ id });
    expect((await db.user.findUniqueOrThrow({ where: { id } })).mustChangePassword).toBe(true);

    await changePassword(id, "nouveaumotdepasse");
    expect((await db.user.findUniqueOrThrow({ where: { id } })).mustChangePassword).toBe(false);
    expect(await authenticate("alice@club.fr", "nouveaumotdepasse")).toEqual({ id });
    // Le solde n'est pas touché par un reset.
    expect(await getBalance(id)).toBe(1000);
  });

  it("signale un email inconnu", async () => {
    await expect(resetPasswordByEmail("personne@club.fr")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
