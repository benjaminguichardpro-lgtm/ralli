import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { computePayout } from "@/lib/predictions/payout";
import { makeUser } from "../../tests/db/factories";
import { createClub, joinClubByCode } from "./clubs";
import { addMatch, createEncounter, publishEncounter } from "./encounters";
import { getLeaderboard } from "./leaderboard";
import { placePrediction } from "./predictions";
import { getResults } from "./results";
import { type MatchResultInput, confirmScore, proposeScore } from "./scores";
import { addNewPlayerToTeam, createExternalTeam, createTeam } from "./teams";

const T0 = new Date("2026-10-10T10:00:00Z");
const BEFORE = new Date("2026-10-12T11:00:00Z");
const NOW = new Date("2026-10-12T15:00:00Z");
const LATER = new Date("2026-10-12T16:00:00Z");

let admin: string, capA: string, capB: string, ana: string, bob: string, clubId: string;
let e1: string, e2: string, e1m: string[], e2m: string[];

const res = (matchId: string, outcome: MatchResultInput["outcome"], winnerSide: "HOME" | "AWAY" | null): MatchResultInput => ({ matchId, outcome, winnerSide, sets: [] });
const bet = (u: string, matchId: string, side: "HOME" | "AWAY", aces: number) => placePrediction(u, { matchId, side, committedAces: aces }, BEFORE);
const settle = async (enc: string, results: MatchResultInput[], at: Date) => {
  await proposeScore(capA, enc, results, at);
  await confirmScore(capB, enc, at);
};

beforeEach(async () => {
  [admin, capA, capB, ana, bob] = (await Promise.all(["Admin", "CapA", "CapB", "Ana", "Bob"].map(makeUser))) as [string, string, string, string, string];
  const club = await createClub(admin, "TC Résultats");
  clubId = club.id;
  for (const u of [capA, capB, ana, bob]) await joinClubByCode(u, club.inviteCode);
  const team = (await createTeam(admin, club.id, { name: "Messieurs 1", captainUserId: capA })).id;
  await createTeam(admin, club.id, { name: "Messieurs 2", captainUserId: capB });
  const ext = (await createExternalTeam(admin, club.id, { name: "TC Voisin 1", externalClubName: "TC Voisin" })).id;
  const mk = async (t: string, f: string, l: string, r: "R30" | "R30_1" | "R15_5") => (await addNewPlayerToTeam(admin, t, { firstName: f, lastName: l, fftRank: r })).id;
  const p = [await mk(team, "Léa", "Martin", "R30"), await mk(team, "Hugo", "Durand", "R30_1"), await mk(team, "Inès", "Petit", "R15_5")];
  const x = [await mk(ext, "Paul", "Voisin", "R30_1"), await mk(ext, "Marc", "Lenoir", "R30_1"), await mk(ext, "Yann", "Roux", "R30")];
  const make = async (startsAt: Date) => {
    const enc = (await createEncounter(capA, { clubTeamId: team, opponentTeamId: ext, clubTeamIsHome: true, startsAt }, T0)).id;
    const ms = [
      (await addMatch(capA, enc, { homePlayerId: p[0]!, awayPlayerId: x[0]! }, T0)).id,
      (await addMatch(capA, enc, { homePlayerId: p[1]!, awayPlayerId: x[1]! }, T0)).id,
      (await addMatch(capA, enc, { homePlayerId: p[2]!, awayPlayerId: x[2]! }, T0)).id,
    ];
    await publishEncounter(capA, enc, T0);
    return { enc, ms };
  };
  ({ enc: e1, ms: e1m } = await make(new Date("2026-10-12T12:00:00Z")));
  ({ enc: e2, ms: e2m } = await make(new Date("2026-10-12T13:00:00Z")));
});

describe("onglet Résultats", () => {
  it("un utilisateur sans ralli terminé : résumé vide, aucune ligne", async () => {
    const r = await getResults(ana);
    expect(r.summary).toMatchObject({ finished: 0, hitRate: null, netAces: 0 });
    expect(r.counts).toEqual({ tous: 0, gagnes: 0, perdus: 0, rembourses: 0 });
    expect(r.groups).toEqual([]);
  });

  it("les rallis en attente n'apparaissent pas ; ils arrivent au règlement, gagné / perdu / remboursé", async () => {
    await bet(ana, e1m[0]!, "HOME", 100);
    await bet(ana, e1m[1]!, "AWAY", 50);
    await bet(ana, e1m[2]!, "HOME", 20);
    expect((await getResults(ana)).counts.tous).toBe(0);
    await settle(e1, [res(e1m[0]!, "COMPLETED", "HOME"), res(e1m[1]!, "COMPLETED", "HOME"), res(e1m[2]!, "NOT_PLAYED", null)], NOW);
    const r = await getResults(ana);
    const win = computePayout(100, (await db.match.findUniqueOrThrow({ where: { id: e1m[0]! } })).oddsHomeX100!);
    expect(r.counts).toEqual({ tous: 3, gagnes: 1, perdus: 1, rembourses: 1 });
    // Le remboursé (20) n'entre ni dans les engagés ni dans le bénéfice.
    expect(r.summary).toMatchObject({ finished: 2, won: 1, lost: 1, refunded: 1, hitRate: 50, committedAces: 150, wonAces: win, netAces: win - 150 });
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0]).toMatchObject({ encounterId: e1, title: "TC Résultats · Messieurs 1 – TC Voisin 1" });
    expect(r.groups[0]!.items.map((i) => i.status).sort()).toEqual(["LOST", "REFUNDED", "WON"]);
    const won = r.groups[0]!.items.find((i) => i.status === "WON")!;
    expect(won).toMatchObject({ matchLabel: "Léa M. contre Paul V.", pickedName: "Léa M.", committedAces: 100, payoutAces: win });
  });

  it("chacun ne voit que ses propres rallis", async () => {
    await bet(ana, e1m[0]!, "HOME", 100);
    await bet(bob, e1m[0]!, "AWAY", 40);
    await settle(e1, [res(e1m[0]!, "COMPLETED", "HOME"), res(e1m[1]!, "NOT_PLAYED", null), res(e1m[2]!, "NOT_PLAYED", null)], NOW);
    const a = await getResults(ana);
    const b = await getResults(bob);
    expect(a.groups.flatMap((g) => g.items)).toHaveLength(1);
    expect(a.summary).toMatchObject({ won: 1, lost: 0 });
    expect(b.groups.flatMap((g) => g.items)).toHaveLength(1);
    expect(b.summary).toMatchObject({ won: 0, lost: 1, committedAces: 40, netAces: -40 });
    expect((await getResults(capA)).counts.tous).toBe(0);
  });

  it("le plus récent d'abord, regroupé par rencontre ; filtres par résultat", async () => {
    await bet(ana, e1m[0]!, "HOME", 100);
    await bet(ana, e2m[0]!, "AWAY", 30);
    await bet(ana, e2m[1]!, "HOME", 30);
    await settle(e1, [res(e1m[0]!, "COMPLETED", "HOME"), res(e1m[1]!, "NOT_PLAYED", null), res(e1m[2]!, "NOT_PLAYED", null)], NOW);
    await settle(e2, [res(e2m[0]!, "COMPLETED", "HOME"), res(e2m[1]!, "COMPLETED", "HOME"), res(e2m[2]!, "NOT_PLAYED", null)], LATER);
    const all = await getResults(ana);
    expect(all.groups.map((g) => g.encounterId)).toEqual([e2, e1]); // e2 réglée après e1
    expect(all.groups[0]!.items).toHaveLength(2);
    expect((await getResults(ana, "gagnes")).groups.flatMap((g) => g.items).map((i) => i.status)).toEqual(["WON", "WON"]);
    expect((await getResults(ana, "perdus")).groups.flatMap((g) => g.items).map((i) => i.status)).toEqual(["LOST"]);
    expect((await getResults(ana, "rembourses")).groups).toEqual([]);
    // Les compteurs et le résumé portent sur l'ensemble, quel que soit le filtre.
    expect((await getResults(ana, "perdus")).counts).toEqual(all.counts);
    expect((await getResults(ana, "perdus")).summary).toEqual(all.summary);
  });

  it("limite : n'affiche que le nombre demandé et dit s'il y en a d'autres", async () => {
    await bet(ana, e1m[0]!, "HOME", 10);
    await bet(ana, e1m[1]!, "HOME", 10);
    await bet(ana, e1m[2]!, "HOME", 10);
    await settle(e1, [res(e1m[0]!, "COMPLETED", "HOME"), res(e1m[1]!, "COMPLETED", "HOME"), res(e1m[2]!, "COMPLETED", "HOME")], NOW);
    const two = await getResults(ana, "tous", 2);
    expect(two.shown).toBe(2);
    expect(two.hasMore).toBe(true);
    expect(two.counts.tous).toBe(3);
    const three = await getResults(ana, "tous", 3);
    expect([three.shown, three.hasMore]).toEqual([3, false]);
  });

  it("série en cours : rallis justes d'affilée, remboursés ignorés, indépendante du filtre et de la limite", async () => {
    // e1 : 3 matchs. Ana gagne m0 et m1, perd m2 (e1 réglée en premier) ; puis e2 : gagne m0, m1 et m2 est remboursé (non joué).
    await bet(ana, e1m[2]!, "AWAY", 10); // perdu
    await bet(ana, e1m[0]!, "HOME", 10); // gagné
    await bet(ana, e1m[1]!, "HOME", 10); // gagné
    await settle(e1, [res(e1m[0]!, "COMPLETED", "HOME"), res(e1m[1]!, "COMPLETED", "HOME"), res(e1m[2]!, "COMPLETED", "HOME")], NOW);
    expect((await getResults(ana)).streak).toBe(2); // le plus récent d'abord : 2 gagnés avant le perdu
    await bet(ana, e2m[0]!, "HOME", 10);
    await bet(ana, e2m[1]!, "HOME", 10);
    await bet(ana, e2m[2]!, "HOME", 10);
    await settle(e2, [res(e2m[0]!, "COMPLETED", "HOME"), res(e2m[1]!, "COMPLETED", "HOME"), res(e2m[2]!, "NOT_PLAYED", null)], LATER);
    const all = await getResults(ana);
    expect(all.streak).toBe(4); // 2 gagnés (e2) + remboursé ignoré + 2 gagnés (e1), puis le perdu coupe
    expect((await getResults(ana, "perdus")).streak).toBe(4); // le filtre ne change pas la série
    expect((await getResults(ana, "tous", 1)).streak).toBe(4); // ni la pagination
    expect((await getResults(bob)).streak).toBe(0);
  });

  it("le bénéfice net est le même que dans le classement du club", async () => {
    await bet(ana, e1m[0]!, "HOME", 100);
    await bet(ana, e1m[1]!, "AWAY", 50);
    await bet(ana, e1m[2]!, "HOME", 20);
    await settle(e1, [res(e1m[0]!, "COMPLETED", "HOME"), res(e1m[1]!, "COMPLETED", "HOME"), res(e1m[2]!, "NOT_PLAYED", null)], NOW);
    await bet(ana, e2m[0]!, "HOME", 60);
    await settle(e2, [res(e2m[0]!, "COMPLETED", "HOME"), res(e2m[1]!, "NOT_PLAYED", null), res(e2m[2]!, "NOT_PLAYED", null)], LATER);
    const board = await getLeaderboard(ana, clubId, "season");
    const row = [...board.top, ...(board.me ? [board.me] : [])].find((r) => r.userId === ana);
    expect(row?.net).toBe((await getResults(ana)).summary.netAces);
  });
});
