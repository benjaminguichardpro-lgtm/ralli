import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { computePayout } from "@/lib/predictions/payout";
import { makeUser } from "../../tests/db/factories";
import { createClub, joinClubByCode } from "./clubs";
import { addMatch, cancelEncounter, createEncounter, publishEncounter, removeMatch } from "./encounters";
import { getBalance } from "./ledger";
import { getWallet, placePrediction } from "./predictions";
import { getResults } from "./results";
import { type MatchResultInput, confirmScore, disputeScore, proposeScore, resolveDispute } from "./scores";
import { settleConfirmedEncounter } from "./settlement";
import { addNewPlayerToTeam, createExternalTeam, createTeam } from "./teams";

const T0 = new Date("2026-10-10T10:00:00Z");
const START = new Date("2026-10-12T12:00:00Z");
const BEFORE = new Date("2026-10-12T11:00:00Z");
const NOW = new Date("2026-10-12T15:00:00Z");

let admin: string, capA: string, capB: string, u1: string, u2: string, u3: string;
let enc: string, mA: string, mB: string, mC: string;

beforeEach(async () => {
  [admin, capA, capB, u1, u2, u3] = (await Promise.all(["Admin", "CapA", "CapB", "Joueur1", "Joueur2", "Joueur3"].map(makeUser))) as [
    string, string, string, string, string, string,
  ];
  const club = await createClub(admin, "TC Ralli");
  for (const u of [capA, capB, u1, u2, u3]) await joinClubByCode(u, club.inviteCode);
  const m1 = (await createTeam(admin, club.id, { name: "Messieurs 1", captainUserId: capA })).id;
  await createTeam(admin, club.id, { name: "Messieurs 2", captainUserId: capB });
  const ext = (await createExternalTeam(admin, club.id, { name: "TC Voisin 1", externalClubName: "TC Voisin" })).id;
  const mk = async (team: string, f: string, l: string, r: "R30" | "R30_1" | "R15_5" | "NC") =>
    (await addNewPlayerToTeam(admin, team, { firstName: f, lastName: l, fftRank: r })).id;
  const p = [await mk(m1, "Léa", "Martin", "R30"), await mk(m1, "Hugo", "Durand", "R30_1"), await mk(m1, "Inès", "Petit", "R15_5")];
  const x = [await mk(ext, "Paul", "Voisin", "R30_1"), await mk(ext, "Marc", "Lenoir", "R30_1"), await mk(ext, "Yann", "Roux", "NC")];
  enc = (await createEncounter(capA, { clubTeamId: m1, opponentTeamId: ext, clubTeamIsHome: true, startsAt: START }, T0)).id;
  mA = (await addMatch(capA, enc, { homePlayerId: p[0]!, awayPlayerId: x[0]! }, T0)).id;
  mB = (await addMatch(capA, enc, { homePlayerId: p[1]!, awayPlayerId: x[1]! }, T0)).id;
  mC = (await addMatch(capA, enc, { homePlayerId: p[2]!, awayPlayerId: x[2]! }, T0)).id;
  await publishEncounter(capA, enc, T0);
});

const bet = (u: string, matchId: string, side: "HOME" | "AWAY", aces: number) => placePrediction(u, { matchId, side, committedAces: aces }, BEFORE);
const res = (matchId: string, outcome: MatchResultInput["outcome"], winnerSide: "HOME" | "AWAY" | null): MatchResultInput => ({ matchId, outcome, winnerSide, sets: [] });
const odds = async (matchId: string, side: "HOME" | "AWAY") => {
  const m = await db.match.findUniqueOrThrow({ where: { id: matchId } });
  return (side === "HOME" ? m.oddsHomeX100 : m.oddsAwayX100)!;
};
const pred = (u: string, matchId: string) => db.prediction.findUniqueOrThrow({ where: { userId_matchId: { userId: u, matchId } } });
const confirmAll = async (results: MatchResultInput[]) => {
  await proposeScore(capA, enc, results, NOW);
  await confirmScore(capB, enc, NOW);
};
const ledgerCount = () => db.ledgerEntry.count();

describe("règlement à la confirmation", () => {
  it("gagnant crédité (engagés × cote), perdant sans rien, match non joué remboursé", async () => {
    await bet(u1, mA, "HOME", 100);
    await bet(u2, mA, "AWAY", 50);
    await bet(u3, mB, "HOME", 80);
    await confirmAll([res(mA, "COMPLETED", "HOME"), res(mB, "NOT_PLAYED", null), res(mC, "COMPLETED", "AWAY")]);

    const payout = computePayout(100, await odds(mA, "HOME"));
    expect(await pred(u1, mA)).toMatchObject({ status: "WON", payoutAces: payout });
    expect(await getBalance(u1)).toBe(1000 - 100 + payout);
    const entry = await db.ledgerEntry.findUniqueOrThrow({ where: { idempotencyKey: `payout:${(await pred(u1, mA)).id}` } });
    expect(entry).toMatchObject({ type: "PREDICTION_PAYOUT", amount: payout, userId: u1 });

    expect(await pred(u2, mA)).toMatchObject({ status: "LOST", payoutAces: 0 });
    expect(await getBalance(u2)).toBe(950);
    expect(await db.ledgerEntry.count({ where: { userId: u2 } })).toBe(2); // inscription + engagement, rien d'autre

    expect(await pred(u3, mB)).toMatchObject({ status: "REFUNDED", payoutAces: 80 });
    expect(await getBalance(u3)).toBe(1000);
    expect((await pred(u1, mA)).settledAt).not.toBeNull();
    expect((await db.encounter.findUniqueOrThrow({ where: { id: enc } })).settledAt).not.toBeNull();
  });

  it("abandon et WO : règlement normal sur le vainqueur déclaré", async () => {
    await bet(u1, mA, "AWAY", 100);
    await bet(u2, mB, "HOME", 100);
    await confirmAll([res(mA, "RETIRED", "AWAY"), res(mB, "WALKOVER", "AWAY"), res(mC, "NOT_PLAYED", null)]);
    expect((await pred(u1, mA)).status).toBe("WON");
    expect((await pred(u2, mB)).status).toBe("LOST");
  });

  it("le pari sur le côté extérieur gagne avec la cote extérieure", async () => {
    await bet(u1, mA, "AWAY", 200);
    await confirmAll([res(mA, "COMPLETED", "AWAY"), res(mB, "COMPLETED", "HOME"), res(mC, "COMPLETED", "HOME")]);
    expect((await pred(u1, mA)).payoutAces).toBe(computePayout(200, await odds(mA, "AWAY")));
  });

  it("rien n'est réglé tant que le score n'est pas définitif (proposé, contesté)", async () => {
    await bet(u1, mA, "HOME", 100);
    await proposeScore(capA, enc, [res(mA, "COMPLETED", "HOME"), res(mB, "COMPLETED", "HOME"), res(mC, "COMPLETED", "HOME")], NOW);
    expect((await pred(u1, mA)).status).toBe("PENDING");
    await disputeScore(capB, enc, "faux", NOW);
    expect((await pred(u1, mA)).status).toBe("PENDING");
    expect((await db.encounter.findUniqueOrThrow({ where: { id: enc } })).settledAt).toBeNull();
    expect(await getBalance(u1)).toBe(900);
  });

  it("après litige, on règle sur le score tranché par l'admin, pas sur la proposition", async () => {
    await bet(u1, mA, "HOME", 100);
    await proposeScore(capA, enc, [res(mA, "COMPLETED", "HOME"), res(mB, "COMPLETED", "HOME"), res(mC, "COMPLETED", "HOME")], NOW);
    await disputeScore(capB, enc, "faux", NOW);
    await resolveDispute(admin, enc, [res(mA, "COMPLETED", "AWAY"), res(mB, "COMPLETED", "HOME"), res(mC, "COMPLETED", "HOME")], NOW);
    expect(await pred(u1, mA)).toMatchObject({ status: "LOST", payoutAces: 0 });
    expect(await getBalance(u1)).toBe(900);
  });

  it("un match retiré avant le début est déjà remboursé : pas de second remboursement", async () => {
    await bet(u1, mC, "HOME", 100);
    await removeMatch(capA, mC, T0);
    expect(await getBalance(u1)).toBe(1000);
    await confirmAll([res(mA, "COMPLETED", "HOME"), res(mB, "COMPLETED", "HOME")]);
    expect(await getBalance(u1)).toBe(1000);
    expect((await pred(u1, mC)).status).toBe("REFUNDED");
  });

  it("conservation : la somme des soldes varie exactement des gains moins les pertes", async () => {
    await bet(u1, mA, "HOME", 100);
    await bet(u2, mA, "AWAY", 300);
    await bet(u3, mB, "HOME", 120);
    await confirmAll([res(mA, "COMPLETED", "HOME"), res(mB, "NOT_PLAYED", null), res(mC, "COMPLETED", "HOME")]);
    const win = computePayout(100, await odds(mA, "HOME"));
    const total = (await Promise.all([u1, u2, u3].map(getBalance))).reduce((a, b) => a + b, 0);
    expect(total).toBe(3000 + (win - 100) - 300);
  });
});

describe("idempotence et atomicité", () => {
  it("relancer le règlement ne crédite jamais deux fois", async () => {
    await bet(u1, mA, "HOME", 100);
    await bet(u3, mB, "HOME", 80);
    await confirmAll([res(mA, "COMPLETED", "HOME"), res(mB, "NOT_PLAYED", null), res(mC, "COMPLETED", "HOME")]);
    const balances = await Promise.all([u1, u2, u3].map(getBalance));
    const entries = await ledgerCount();
    expect(await settleConfirmedEncounter(enc, NOW)).toEqual({ won: 0, lost: 0, refunded: 0 });
    expect(await settleConfirmedEncounter(enc, NOW)).toEqual({ won: 0, lost: 0, refunded: 0 });
    expect(await Promise.all([u1, u2, u3].map(getBalance))).toEqual(balances);
    expect(await ledgerCount()).toBe(entries);
  });

  it("deux règlements simultanés d'un règlement manquant : un seul crédit", async () => {
    await bet(u1, mA, "HOME", 100);
    await confirmAll([res(mA, "COMPLETED", "HOME"), res(mB, "COMPLETED", "HOME"), res(mC, "COMPLETED", "HOME")]);
    const payout = computePayout(100, await odds(mA, "HOME"));
    // Simule un règlement jamais fait : gain retiré, pronostic remis en attente.
    await db.$executeRaw`TRUNCATE "LedgerEntry"`; // le ledger refuse DELETE : on repart d'un ledger vide
    await db.prediction.update({ where: { userId_matchId: { userId: u1, matchId: mA } }, data: { status: "PENDING", payoutAces: null, settledAt: null } });
    await db.encounter.update({ where: { id: enc }, data: { settledAt: null } });
    const r = await Promise.allSettled([settleConfirmedEncounter(enc, NOW), settleConfirmedEncounter(enc, NOW)]);
    expect(r.every((x) => x.status === "fulfilled")).toBe(true);
    expect(await db.ledgerEntry.count({ where: { type: "PREDICTION_PAYOUT" } })).toBe(1);
    expect(await getBalance(u1)).toBe(payout);
  });

  it("filet de sécurité : règle une rencontre confirmée restée en attente, une seule fois", async () => {
    await bet(u1, mA, "HOME", 100);
    await confirmAll([res(mA, "COMPLETED", "HOME"), res(mB, "COMPLETED", "HOME"), res(mC, "COMPLETED", "HOME")]);
    // Simule un règlement jamais fait : pronostic remis en attente, écriture de gain retirée.
    await db.$executeRaw`TRUNCATE "LedgerEntry"`;
    await db.prediction.update({ where: { userId_matchId: { userId: u1, matchId: mA } }, data: { status: "PENDING", payoutAces: null, settledAt: null } });
    await db.encounter.update({ where: { id: enc }, data: { settledAt: null } });
    expect(await settleConfirmedEncounter(enc, NOW)).toEqual({ won: 1, lost: 0, refunded: 0 });
    expect(await settleConfirmedEncounter(enc, NOW)).toEqual({ won: 0, lost: 0, refunded: 0 });
    expect(await ledgerCount()).toBe(1);
  });

  it("si le règlement échoue, la confirmation est annulée avec lui", async () => {
    await bet(u1, mA, "HOME", 100);
    await proposeScore(capA, enc, [res(mA, "COMPLETED", "HOME"), res(mB, "COMPLETED", "HOME"), res(mC, "COMPLETED", "HOME")], NOW);
    const p = await pred(u1, mA);
    // Une écriture déjà présente sous la même clé fait échouer le crédit du gain.
    await db.ledgerEntry.create({ data: { userId: u1, type: "PREDICTION_REFUND", amount: 1, idempotencyKey: `payout:${p.id}` } });
    await expect(confirmScore(capB, enc, NOW)).rejects.toThrow();
    const e = await db.encounter.findUniqueOrThrow({ where: { id: enc } });
    expect(e).toMatchObject({ status: "SCORE_PROPOSED", settledAt: null });
    expect((await pred(u1, mA)).status).toBe("PENDING");
    expect(await db.encounterEvent.count({ where: { encounterId: enc, toStatus: "CONFIRMED" } })).toBe(0);
  });

  it("refuse de régler une rencontre qui n'est pas confirmée, ou inconnue", async () => {
    await expect(settleConfirmedEncounter(enc, NOW)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(settleConfirmedEncounter("inconnue", NOW)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rencontre annulée : remboursée à l'annulation, jamais réglée ensuite", async () => {
    await bet(u1, mA, "HOME", 100);
    await cancelEncounter(capA, enc, "pluie", BEFORE);
    expect(await getBalance(u1)).toBe(1000);
    await expect(settleConfirmedEncounter(enc, NOW)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    expect(await getBalance(u1)).toBe(1000);
  });
});

describe("portefeuille après règlement", () => {
  it("le solde et l'historique suivent ; plus rien n'est en attente (les rallis terminés sont dans l'onglet Résultats)", async () => {
    await bet(u1, mA, "HOME", 100);
    await bet(u1, mB, "AWAY", 50);
    await bet(u1, mC, "HOME", 20);
    await confirmAll([res(mA, "COMPLETED", "HOME"), res(mB, "COMPLETED", "HOME"), res(mC, "NOT_PLAYED", null)]);
    const w = await getWallet(u1);
    expect(w.pending).toEqual([]);
    expect(w.pendingAces).toBe(0);
    expect(w.entries.map((e) => e.label)).toContain("Aces gagnés");
    const r = await getResults(u1);
    expect(r.groups.flatMap((g) => g.items).map((i) => i.status).sort()).toEqual(["LOST", "REFUNDED", "WON"]);
    expect(r.groups.flatMap((g) => g.items).find((i) => i.status === "WON")!.payoutAces).toBe(computePayout(100, await odds(mA, "HOME")));
  });
});
