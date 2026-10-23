import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { clearLoginFailures, clientIp, loginWaitMs, recordLoginFailure, recordSignup, signupWaitMs, tooManyAttemptsMessage } from "./rate-limit";

const MIN = 60_000;
const T0 = new Date("2026-10-23T10:00:00Z");
const at = (minutes: number) => new Date(T0.getTime() + minutes * MIN);

describe("limite d'essais à la connexion", () => {
  it("5 échecs en 15 minutes bloquent 15 minutes à partir du dernier échec", async () => {
    for (let i = 0; i < 4; i++) await recordLoginFailure("alice", null, at(i));
    expect(await loginWaitMs("alice", null, at(4))).toBe(0);
    await recordLoginFailure("alice", null, at(4));
    expect(await loginWaitMs("alice", null, at(5))).toBe(14 * MIN);
    expect(await loginWaitMs("alice", null, at(19))).toBe(0);
  });

  it("le blocage est progressif : 10 échecs en une heure bloquent une heure", async () => {
    for (let i = 0; i < 10; i++) await recordLoginFailure("alice", null, at(i * 5));
    expect(await loginWaitMs("alice", null, at(46))).toBe(60 * MIN - 1 * MIN); // dernier échec à la minute 45
  });

  it("ne dépend ni de la casse ni des espaces, et ne touche pas un autre compte", async () => {
    for (let i = 0; i < 5; i++) await recordLoginFailure("  ALICE ", null, at(i));
    expect(await loginWaitMs("alice", null, at(5))).toBeGreaterThan(0);
    expect(await loginWaitMs("bob", null, at(5))).toBe(0);
  });

  it("une connexion réussie efface les échecs du compte", async () => {
    for (let i = 0; i < 5; i++) await recordLoginFailure("alice", null, at(i));
    await clearLoginFailures("alice");
    expect(await loginWaitMs("alice", null, at(5))).toBe(0);
  });

  it("une adresse IP qui échoue 20 fois sur des comptes différents est bloquée", async () => {
    for (let i = 0; i < 20; i++) await recordLoginFailure(`compte${i}`, "203.0.113.7", at(i / 4));
    expect(await loginWaitMs("quelquun-d-autre", "203.0.113.7", at(6))).toBeGreaterThan(0);
    expect(await loginWaitMs("quelquun-d-autre", "203.0.113.8", at(6))).toBe(0);
    expect(await loginWaitMs("quelquun-d-autre", null, at(6))).toBe(0); // adresse inconnue : pas de limite par IP
  });

  it("ne garde ni le pseudo ni l'adresse IP en clair, et efface les essais de plus de 24 h", async () => {
    await recordLoginFailure("alice", "203.0.113.7", at(0));
    const rows = await db.authAttempt.findMany();
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r.keyHash).toMatch(/^[0-9a-f]{64}$/);
    await recordLoginFailure("bob", null, at(25 * 60));
    expect(await db.authAttempt.count({ where: { createdAt: { lt: at(60) } } })).toBe(0);
  });
});

describe("limite d'inscriptions par adresse IP", () => {
  it("5 inscriptions par heure et par adresse", async () => {
    for (let i = 0; i < 5; i++) await recordSignup("203.0.113.7", at(i));
    expect(await signupWaitMs("203.0.113.7", at(10))).toBe(54 * MIN);
    expect(await signupWaitMs("203.0.113.8", at(10))).toBe(0);
    expect(await signupWaitMs("203.0.113.7", at(65))).toBe(0);
    expect(await signupWaitMs(null, at(10))).toBe(0);
  });
});

describe("clientIp et message", () => {
  it("lit la première adresse de x-forwarded-for", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "198.51.100.4, 10.0.0.1" }))).toBe("198.51.100.4");
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.5" }))).toBe("198.51.100.5");
    expect(clientIp(new Headers())).toBeNull();
    for (const local of ["::1", "127.0.0.1", "::ffff:127.0.0.1"]) expect(clientIp(new Headers({ "x-forwarded-for": local })), local).toBeNull(); // la machine elle-même
  });
  it("annonce le délai en minutes ou en heures", () => {
    expect(tooManyAttemptsMessage(30_000)).toBe("Trop d'essais. Réessaie dans 1 minute.");
    expect(tooManyAttemptsMessage(14 * MIN)).toBe("Trop d'essais. Réessaie dans 14 minutes.");
    expect(tooManyAttemptsMessage(60 * MIN)).toBe("Trop d'essais. Réessaie dans 1 h.");
    expect(tooManyAttemptsMessage(23 * 60 * MIN)).toBe("Trop d'essais. Réessaie plus tard.");
  });
});
