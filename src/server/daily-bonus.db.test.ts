import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { makeUser } from "../../tests/db/factories";
import { claimDailyBonus } from "./daily-bonus";
import { getBalance } from "./ledger";
import { getWallet } from "./predictions";
import { grantWeeklyBonus } from "./weekly-bonus";

let ana: string, bob: string;
beforeEach(async () => {
  [ana, bob] = (await Promise.all(["Ana", "Bob"].map(makeUser))) as [string, string];
});

/** Midi (UTC) du n-ième jour à partir du 1er mars 2031 : bien après la création des comptes de test, même jour à Paris. */
const day = (n: number) => new Date(Date.UTC(2031, 2, 1 + n, 10, 0, 0));
const ledger = (userId: string) => db.ledgerEntry.findMany({ where: { userId, type: { in: ["DAILY_LOGIN_BONUS", "STREAK_BONUS"] } }, orderBy: { idempotencyKey: "asc" } });

describe("règles du bonus de connexion", () => {
  it("le jour de l'inscription ne donne rien : la série démarre le lendemain", async () => {
    const created = (await db.user.findUniqueOrThrow({ where: { id: ana } })).createdAt;
    expect(await claimDailyBonus(ana, created)).toEqual({ claimed: false });
    expect(await getBalance(ana)).toBe(1000);
    expect(await ledger(ana)).toHaveLength(0);
  });

  it("le lendemain : +10 Aces, jour 1 sur 7, écriture au ledger avec sa clé du jour", async () => {
    const r = await claimDailyBonus(ana, day(0));
    expect(r).toMatchObject({ claimed: true, streak: 1, position: 1, length: 7, dailyAmount: 10, streakBonus: 0, total: 10, balance: 1010 });
    const [entry] = await ledger(ana);
    expect(entry).toMatchObject({ type: "DAILY_LOGIN_BONUS", amount: 10, idempotencyKey: `daily:${ana}:2031-03-01` });
    expect(await getBalance(ana)).toBe(1010);
  });

  it("une seule fois par jour, quel que soit le nombre d'ouvertures", async () => {
    await claimDailyBonus(ana, day(0));
    expect(await claimDailyBonus(ana, new Date(day(0).getTime() + 3_600_000))).toEqual({ claimed: false });
    expect(await claimDailyBonus(ana, day(0))).toEqual({ claimed: false });
    expect(await getBalance(ana)).toBe(1010);
    expect(await ledger(ana)).toHaveLength(1);
  });

  it("le jour se compte en heure de Paris : 23:59 puis 00:00 sont deux jours différents", async () => {
    await claimDailyBonus(ana, new Date("2031-03-01T22:59:00Z")); // 23:59 le 1er mars à Paris (UTC+1)
    expect(await claimDailyBonus(ana, new Date("2031-03-01T23:30:00Z"))).toMatchObject({ claimed: true, position: 2 }); // 00:30 le 2
    expect(await getBalance(ana)).toBe(1020);
  });

  it("7 jours d'affilée : +10 chaque jour, et +50 en plus le 7e (60 ce jour-là)", async () => {
    for (let i = 0; i < 6; i++) {
      const r = await claimDailyBonus(ana, day(i));
      expect(r).toMatchObject({ claimed: true, position: i + 1, streakBonus: 0, total: 10 });
    }
    expect(await getBalance(ana)).toBe(1060);
    const r7 = await claimDailyBonus(ana, day(6));
    expect(r7).toMatchObject({ claimed: true, streak: 7, position: 7, dailyAmount: 10, streakBonus: 50, total: 60, balance: 1120 });
    const entries = await ledger(ana);
    expect(entries.filter((e) => e.type === "STREAK_BONUS")).toEqual([expect.objectContaining({ amount: 50, idempotencyKey: `streak:${ana}:2031-03-07` })]);
    expect(entries.filter((e) => e.type === "DAILY_LOGIN_BONUS")).toHaveLength(7);
  });

  it("le lendemain du 7e jour la série recommence à 1/7, puis +50 revient au 14e jour", async () => {
    for (let i = 0; i < 7; i++) await claimDailyBonus(ana, day(i));
    expect(await claimDailyBonus(ana, day(7))).toMatchObject({ streak: 8, position: 1, streakBonus: 0, total: 10 });
    for (let i = 8; i < 13; i++) await claimDailyBonus(ana, day(i));
    const r14 = await claimDailyBonus(ana, day(13));
    expect(r14).toMatchObject({ streak: 14, position: 7, streakBonus: 50, total: 60 });
    expect(await db.ledgerEntry.count({ where: { userId: ana, type: "STREAK_BONUS" } })).toBe(2);
    expect(await getBalance(ana)).toBe(1000 + 14 * 10 + 2 * 50);
  });

  it("un jour manqué remet la série à 1, sans bonus de série", async () => {
    for (const i of [0, 1, 2]) await claimDailyBonus(ana, day(i));
    expect(await claimDailyBonus(ana, day(4))).toMatchObject({ claimed: true, streak: 1, position: 1 }); // jour 3 manqué
    for (const i of [5, 6, 7, 8, 9]) await claimDailyBonus(ana, day(i));
    expect(await claimDailyBonus(ana, day(10))).toMatchObject({ streak: 7, streakBonus: 50 }); // 7 jours depuis le jour manqué
  });

  it("la série traverse le changement d'heure sans perdre de jour", async () => {
    const start = Date.UTC(2031, 2, 27, 10, 0, 0); // le passage à l'heure d'été est le dimanche 30 mars 2031
    let last = await claimDailyBonus(ana, new Date(start));
    for (let i = 1; i < 7; i++) last = await claimDailyBonus(ana, new Date(start + i * 86_400_000));
    expect(last).toMatchObject({ streak: 7, streakBonus: 50 });
  });

  it("les comptes sont indépendants", async () => {
    await claimDailyBonus(ana, day(0));
    await claimDailyBonus(ana, day(1));
    expect(await claimDailyBonus(bob, day(1))).toMatchObject({ claimed: true, position: 1 });
    expect(await getBalance(ana)).toBe(1020);
    expect(await getBalance(bob)).toBe(1010);
  });

  it("deux ouvertures simultanées le même jour : un seul crédit", async () => {
    const r = await Promise.all([claimDailyBonus(ana, day(0)), claimDailyBonus(ana, day(0))]);
    expect(r.filter((x) => x.claimed)).toHaveLength(1);
    expect(await getBalance(ana)).toBe(1010);
    expect(await ledger(ana)).toHaveLength(1);
  });

  it("compte inconnu : erreur claire", async () => {
    await expect(claimDailyBonus("inconnu", day(0))).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("garde-fous en base et cohabitation", () => {
  it("le ledger refuse un bonus de connexion ou de série de montant nul ou négatif", async () => {
    for (const type of ["DAILY_LOGIN_BONUS", "STREAK_BONUS"] as const) {
      for (const amount of [0, -10]) {
        await expect(db.ledgerEntry.create({ data: { userId: ana, type, amount, idempotencyKey: `t:${type}:${amount}` } })).rejects.toThrow();
      }
    }
  });

  it("la clé unique du ledger bloque un second crédit du même jour, même contourné", async () => {
    await claimDailyBonus(ana, day(0));
    await expect(
      db.ledgerEntry.create({ data: { userId: ana, type: "DAILY_LOGIN_BONUS", amount: 10, idempotencyKey: `daily:${ana}:2031-03-01` } }),
    ).rejects.toThrow();
  });

  it("le portefeuille nomme les deux types d'écriture", async () => {
    for (let i = 0; i < 7; i++) await claimDailyBonus(ana, day(i));
    const labels = (await getWallet(ana)).entries.map((e) => e.label);
    expect(labels).toContain("Connexion quotidienne");
    expect(labels).toContain("Bonus de 7 jours d'affilée");
  });

  it("se cumule avec le bonus du lundi (+200 sous 500 Aces) sans interférence", async () => {
    await db.ledgerEntry.create({ data: { userId: ana, type: "PREDICTION_COMMIT", amount: -700, idempotencyKey: "t:commit" } }); // solde 300
    await claimDailyBonus(ana, day(0)); // 310
    await grantWeeklyBonus(day(0)); // +200
    expect(await getBalance(ana)).toBe(510);
    expect((await grantWeeklyBonus(day(0))).granted).toBe(0);
    expect(await claimDailyBonus(ana, day(0))).toEqual({ claimed: false });
  });
});
