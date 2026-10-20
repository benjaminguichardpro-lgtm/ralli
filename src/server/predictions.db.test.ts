import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { makeUser } from "../../tests/db/factories";
import { joinClub } from "./club-directory";
import { createClub } from "./clubs";
import { addMatch, cancelEncounter, createEncounter, publishEncounter, removeMatch, rescheduleEncounter } from "./encounters";
import { getBalance } from "./ledger";
import { getPredictionPanel, getWallet, placePrediction } from "./predictions";
import { addNewPlayerToTeam, createExternalTeam, createTeam, setPlayerAccount } from "./teams";
import { grantWeeklyBonus } from "./weekly-bonus";

const T0 = new Date("2026-10-10T10:00:00Z");
const START = new Date("2026-10-12T12:00:00Z");
const BEFORE_START = new Date("2026-10-12T11:59:00Z");
const AT_START = START;

let admin: string, capA: string, capB: string, member: string, other: string, outsider: string, linked: string;
let clubId: string, enc: string, mA: string, mB: string;
let pLinked: string;

beforeEach(async () => {
  [admin, capA, capB, member, other, outsider, linked] = (await Promise.all(
    ["Admin", "CapA", "CapB", "Membre", "Autre", "Dehors", "Lie"].map(makeUser),
  )) as [string, string, string, string, string, string, string];
  const club = await createClub(admin, "TC Ralli");
  clubId = club.id;
  for (const u of [capA, capB, member, other, linked]) await joinClub(u, club.id);
  await createClub(outsider, "AS Ailleurs");
  const m1 = (await createTeam(admin, clubId, { name: "Messieurs 1", captainUserId: capA })).id;
  const m2 = (await createTeam(admin, clubId, { name: "Messieurs 2", captainUserId: capB })).id;
  const ext = (await createExternalTeam(admin, clubId, { name: "TC Voisin 1", externalClubName: "TC Voisin" })).id;
  const p1 = (await addNewPlayerToTeam(admin, m1, { firstName: "Léa", lastName: "Martin", fftRank: "R30" })).id;
  pLinked = (await addNewPlayerToTeam(admin, m1, { firstName: "Hugo", lastName: "Durand", fftRank: "R30_1" })).id;
  const p3 = (await addNewPlayerToTeam(admin, m1, { firstName: "Inès", lastName: "Petit", fftRank: "R15_5" })).id;
  const x1 = (await addNewPlayerToTeam(admin, ext, { firstName: "Paul", lastName: "Voisin", fftRank: "R30_1" })).id;
  const x2 = (await addNewPlayerToTeam(admin, ext, { firstName: "Marc", lastName: "Lenoir", fftRank: "R30_2" })).id;
  const x3 = (await addNewPlayerToTeam(admin, ext, { firstName: "Yann", lastName: "Roux", fftRank: "NC" })).id;
  await setPlayerAccount(admin, pLinked, linked);
  void m2;
  enc = (await createEncounter(capA, { clubTeamId: m1, opponentTeamId: ext, clubTeamIsHome: true, startsAt: START }, T0)).id;
  mA = (await addMatch(capA, enc, { homePlayerId: p1, awayPlayerId: x1 }, T0)).id;
  mB = (await addMatch(capA, enc, { homePlayerId: pLinked, awayPlayerId: x2 }, T0)).id;
  void p3;
  void x3;
  await publishEncounter(capA, enc, T0);
});

const predict = (userId: string, matchId = mA, committedAces = 100, side: "HOME" | "AWAY" = "HOME", now = T0) =>
  placePrediction(userId, { matchId, side, committedAces }, now);

describe("placePrediction : cas nominal", () => {
  it("copie la cote du match, débite le solde et écrit au ledger", async () => {
    const { id } = await predict(member, mA, 100, "AWAY");
    const m = await db.match.findUniqueOrThrow({ where: { id: mA } });
    const p = await db.prediction.findUniqueOrThrow({ where: { id } });
    expect(p).toMatchObject({ userId: member, pickedSide: "AWAY", committedAces: 100, oddsX100: m.oddsAwayX100, status: "PENDING" });
    expect(await getBalance(member)).toBe(900);
    const entry = await db.ledgerEntry.findUniqueOrThrow({ where: { idempotencyKey: `commit:${id}` } });
    expect(entry).toMatchObject({ type: "PREDICTION_COMMIT", amount: -100, predictionId: id });
  });

  it("autorise plusieurs matchs de la même rencontre, et l'engagement de tout le solde", async () => {
    await predict(member, mA, 400);
    await predict(member, mB, 600);
    expect(await getBalance(member)).toBe(0);
  });
});

describe("placePrediction : règles", () => {
  it("refuse moins de 10 Aces, les décimaux et les montants absurdes", async () => {
    for (const n of [9, 0, -5, 10.5, Number.NaN]) {
      await expect(predict(member, mA, n)).rejects.toMatchObject({ code: "INVALID" });
    }
    expect(await getBalance(member)).toBe(1000);
  });

  it("accepte exactement 10 Aces", async () => {
    await predict(member, mA, 10);
    expect(await getBalance(member)).toBe(990);
  });

  it("refuse un montant supérieur au solde", async () => {
    await expect(predict(member, mA, 1001)).rejects.toMatchObject({ code: "INVALID", message: expect.stringContaining("Solde insuffisant") });
    await predict(member, mA, 700);
    await expect(predict(member, mB, 301)).rejects.toMatchObject({ message: expect.stringContaining("Solde insuffisant") });
    expect(await getBalance(member)).toBe(300);
  });

  it("un seul pronostic par match, définitif (même pour l'autre camp)", async () => {
    await predict(member, mA, 100, "HOME");
    await expect(predict(member, mA, 100, "AWAY")).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await db.prediction.count({ where: { userId: member } })).toBe(1);
    expect(await getBalance(member)).toBe(900);
  });

  it("deux pronostics simultanés ne dépassent pas le solde", async () => {
    const results = await Promise.allSettled([predict(member, mA, 700), predict(member, mB, 700)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await getBalance(member)).toBe(300);
  });

  it("deux envois simultanés du même match : un seul passe", async () => {
    const results = await Promise.allSettled([predict(member, mA, 100), predict(member, mA, 100)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await getBalance(member)).toBe(900);
  });

  it("ferme à l'heure de début (borne incluse) mais reste ouvert une minute avant", async () => {
    await predict(member, mA, 50, "HOME", BEFORE_START);
    await expect(predict(member, mB, 50, "HOME", AT_START)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });

  it("refuse hors OPEN : brouillon, annulée", async () => {
    await cancelEncounter(capA, enc, "pluie", T0);
    await expect(predict(member)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });

  it("refuse un match retiré, et un identifiant inconnu", async () => {
    await removeMatch(capA, mB, T0);
    await expect(predict(member, mB)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(predict(member, "inconnu")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("un report après le début laisse les pronostics fermés", async () => {
    const later = new Date("2026-10-13T12:00:00Z");
    await rescheduleEncounter(capA, enc, later, new Date(START.getTime() + 60_000));
    await expect(predict(member, mA, 50, "HOME", new Date(START.getTime() + 120_000))).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });

  it("réservé aux membres du club organisateur (un non-membre reçoit NOT_FOUND)", async () => {
    await expect(predict(outsider)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await getBalance(outsider)).toBe(1000);
  });
});

describe("placePrediction : anti-trucage", () => {
  it("refuse l'admin du club, les capitaines de l'équipe, et le compte lié à un joueur aligné", async () => {
    for (const u of [admin, capA, linked]) {
      await expect(predict(u, mA)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(predict(u, mB)).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect(await db.prediction.count()).toBe(0);
  });

  it("le capitaine d'une autre équipe du club peut pronostiquer cette rencontre", async () => {
    await predict(capB, mA);
    expect(await getBalance(capB)).toBe(900);
  });

  it("un joueur aligné ici peut pronostiquer une autre rencontre du club", async () => {
    const other = await db.team.findFirstOrThrow({ where: { clubId, name: "Messieurs 2" } });
    const ext2 = (await createExternalTeam(admin, clubId, { name: "TC Autre", externalClubName: "TC Autre" })).id;
    const a = (await addNewPlayerToTeam(admin, other.id, { firstName: "Al", lastName: "Un", fftRank: "R30" })).id;
    const b = (await addNewPlayerToTeam(admin, ext2, { firstName: "Bo", lastName: "Deux", fftRank: "R30" })).id;
    const e2 = (await createEncounter(capB, { clubTeamId: other.id, opponentTeamId: ext2, clubTeamIsHome: true, startsAt: START }, T0)).id;
    const m = (await addMatch(capB, e2, { homePlayerId: a, awayPlayerId: b }, T0)).id;
    await publishEncounter(capB, e2, T0);
    await predict(linked, m);
    expect(await getBalance(linked)).toBe(900);
  });
});

describe("remboursement et lecture", () => {
  it("l'annulation rembourse un pronostic créé par le service", async () => {
    await predict(member, mA, 250);
    await cancelEncounter(capA, enc, "pluie", T0);
    expect(await getBalance(member)).toBe(1000);
  });

  it("getPredictionPanel : membre, exclu, non-membre, anonyme", async () => {
    await predict(member, mA, 100);
    const p = await getPredictionPanel(member, enc);
    expect(p).toMatchObject({ isMember: true, blockedReason: null, balance: 900 });
    expect(p.mine[mA]).toMatchObject({ committedAces: 100, status: "PENDING" });
    expect((await getPredictionPanel(capA, enc)).blockedReason).toContain("capitaine");
    expect((await getPredictionPanel(linked, enc)).blockedReason).toContain("aligné");
    expect((await getPredictionPanel(admin, enc)).blockedReason).toContain("admins");
    expect((await getPredictionPanel(outsider, enc)).isMember).toBe(false);
    expect((await getPredictionPanel(null, enc)).isMember).toBe(false);
  });

  it("getWallet : solde, en attente et historique", async () => {
    await predict(member, mA, 100);
    const w = await getWallet(member);
    expect(w.balance).toBe(900);
    expect(w.pendingAces).toBe(100);
    expect(w.pending).toHaveLength(1);
    expect(w.pending[0]!.matchLabel).toBe("Léa Martin contre Paul Voisin");
    expect(w.entries.map((e) => e.label)).toEqual(["Aces engagés", "Bonus d'inscription"]);
  });
});

describe("bonus du lundi", () => {
  const MONDAY = new Date("2026-10-12T06:00:00Z"); // semaine ISO 2026-W42

  async function setBalance(userId: string, target: number) {
    const delta = target - (await getBalance(userId));
    await db.ledgerEntry.create({
      data: { userId, type: delta >= 0 ? "PREDICTION_REFUND" : "PREDICTION_COMMIT", amount: delta, idempotencyKey: `test:${userId}:${target}` },
    });
  }

  it("crédite 200 Aces sous 500, pas à 500 ni au-dessus", async () => {
    await setBalance(member, 499);
    await setBalance(other, 500);
    const r = await grantWeeklyBonus(MONDAY);
    expect(r.week).toBe("2026-W42");
    expect(await getBalance(member)).toBe(699);
    expect(await getBalance(other)).toBe(500);
    expect(await getBalance(admin)).toBe(1000);
  });

  it("compte un solde à 0 et ne crédite qu'une fois par semaine ISO", async () => {
    await setBalance(member, 0);
    await grantWeeklyBonus(MONDAY);
    expect(await getBalance(member)).toBe(200);
    expect((await grantWeeklyBonus(new Date("2026-10-14T10:00:00Z"))).granted).toBe(0);
    expect(await getBalance(member)).toBe(200);
    await grantWeeklyBonus(new Date("2026-10-19T06:00:00Z")); // W43 : solde 200 < 500, nouveau bonus
    expect(await getBalance(member)).toBe(400);
  });

  it("deux lancements simultanés ne créditent qu'une fois", async () => {
    await setBalance(member, 0);
    await Promise.all([grantWeeklyBonus(MONDAY), grantWeeklyBonus(MONDAY)]);
    expect(await getBalance(member)).toBe(200);
  });

  it("les Aces engagés sont déjà déduits du solde pris en compte", async () => {
    await predict(member, mA, 600); // solde 400
    await grantWeeklyBonus(MONDAY);
    expect(await getBalance(member)).toBe(600);
  });
});
