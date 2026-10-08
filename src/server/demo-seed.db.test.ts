import { describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { DEMO_EMAIL_DOMAIN, DEMO_PASSWORD, inspectDatabase, seedDemo, wipeAll } from "./demo-seed";
import { authenticate } from "./accounts";
import { getLeaderboard } from "./leaderboard";
import { placePrediction } from "./predictions";

const NOW = new Date("2026-10-08T14:00:00Z"); // jeudi

// Le seed enchaîne plusieurs centaines d'opérations sur la base de test.
vi.setConfig({ testTimeout: 120_000 });

describe("seed de démonstration", () => {
  it("crée les clubs, les rencontres dans chaque état et des soldes cohérents", async () => {
    const summary = await seedDemo(NOW);
    expect(summary.clubs).toHaveLength(3);
    expect(await inspectDatabase()).toEqual({ demoUsers: 14, otherUsers: 0 });
    expect(await authenticate("parieur1", DEMO_PASSWORD)).not.toBeNull();
    expect(await authenticate(`admin_lyon${DEMO_EMAIL_DOMAIN}`, DEMO_PASSWORD)).not.toBeNull();

    // Un exemple de chaque état d'affichage.
    const encounters = await db.encounter.findMany({ select: { id: true, status: true, startsAt: true, predictionsCloseAt: true, settledAt: true } });
    const count = (s: string) => encounters.filter((e) => e.status === s).length;
    expect(count("CONFIRMED")).toBe(5);
    expect(count("DISPUTED")).toBe(1);
    expect(count("SCORE_PROPOSED")).toBe(1);
    expect(count("CANCELLED")).toBe(1);
    expect(count("DRAFT")).toBe(1);
    const open = encounters.filter((e) => e.status === "OPEN");
    expect(open).toHaveLength(3); // 2 à venir + 1 verrouillée (début passé)
    expect(open.filter((e) => e.startsAt <= NOW)).toHaveLength(1);

    // Les pronostics des rencontres confirmées sont tous réglés ; ceux de l'annulée sont remboursés.
    const stats = await db.prediction.groupBy({ by: ["status"], _count: { _all: true } });
    const by = Object.fromEntries(stats.map((s) => [s.status, s._count._all]));
    expect(by.WON).toBeGreaterThan(0);
    expect(by.LOST).toBeGreaterThan(0);
    expect(by.REFUNDED).toBeGreaterThan(0);
    expect(by.PENDING).toBeGreaterThan(0);

    // Aucun solde négatif : chaque compte garde son bonus d'inscription moins ses engagements.
    const sums = await db.ledgerEntry.groupBy({ by: ["userId"], _sum: { amount: true } });
    for (const s of sums) expect(s._sum.amount ?? 0, "solde").toBeGreaterThanOrEqual(0);

    // Les deux classements de Lyon ont de quoi s'afficher.
    const lyon = await db.club.findFirstOrThrow({ where: { name: "TC Démo-Lyon" } });
    const viewer = await db.user.findFirstOrThrow({ where: { displayName: "parieur1" } });
    const season = await getLeaderboard(viewer.id, lyon.id, "season", { now: NOW });
    expect(season.total).toBeGreaterThanOrEqual(5);
    const week = await getLeaderboard(viewer.id, lyon.id, "week", { now: NOW });
    expect(week.total).toBeGreaterThanOrEqual(5);
  });

  it("applique l'anti-trucage : le joueur lié à une fiche ne peut pas pronostiquer sa rencontre", async () => {
    await seedDemo(NOW);
    const joueur = await db.user.findFirstOrThrow({ where: { displayName: "joueur_lyon" } });
    const m = await db.match.findFirstOrThrow({
      where: { encounter: { status: "OPEN", startsAt: { gt: NOW }, organizerClub: { name: "TC Démo-Lyon" } }, voidedAt: null },
    });
    await expect(placePrediction(joueur.id, { matchId: m.id, side: "HOME", committedAces: 10 }, NOW)).rejects.toThrow();
  });

  it("peut être refait à neuf après un vidage", async () => {
    await seedDemo(NOW);
    await wipeAll();
    expect(await inspectDatabase()).toEqual({ demoUsers: 0, otherUsers: 0 });
    await seedDemo(NOW);
    expect((await inspectDatabase()).demoUsers).toBe(14);
  });
});
