import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { computePayout } from "@/lib/predictions/payout";
import { makeUser } from "../../tests/db/factories";
import { joinClub } from "./club-directory";
import { createClub } from "./clubs";
import { addMatch, createEncounter, publishEncounter } from "./encounters";
import { getLeaderboard } from "./leaderboard";
import { grantWeeklyBonus } from "./weekly-bonus";
import { placePrediction } from "./predictions";
import { type MatchResultInput, confirmScore, proposeScore } from "./scores";
import { addNewPlayerToTeam, createExternalTeam, createTeam } from "./teams";

const CREATED = new Date("2026-06-01T10:00:00Z");
const NOW = new Date("2026-10-14T10:00:00Z"); // mercredi, semaine du lundi 12 octobre (heure de Paris)

let admin: string, capA: string, capB: string, ana: string, bob: string, cleo: string, dan: string, outsider: string;
let clubId: string, otherClubId: string;
let teamId: string, extId: string, players: { home: string[]; away: string[] };

beforeEach(async () => {
  [admin, capA, capB, ana, bob, cleo, dan, outsider] = (await Promise.all(["Admin", "CapA", "CapB", "Ana", "Bob", "Cleo", "Dan", "Dehors"].map(makeUser))) as string[] as [
    string, string, string, string, string, string, string, string,
  ];
  const club = await createClub(admin, "TC Ralli");
  clubId = club.id;
  for (const u of [capA, capB, ana, bob, cleo, dan]) await joinClub(u, club.id);
  otherClubId = (await createClub(outsider, "AS Ailleurs")).id;
  teamId = (await createTeam(admin, clubId, { name: "Messieurs 1", captainUserId: capA })).id;
  await createTeam(admin, clubId, { name: "Messieurs 2", captainUserId: capB });
  extId = (await createExternalTeam(admin, clubId, { name: "TC Voisin 1", externalClubName: "TC Voisin" })).id;
  const mk = async (team: string, f: string, r: "R30" | "R30_1") => (await addNewPlayerToTeam(admin, team, { firstName: f, lastName: "Nom", fftRank: r })).id;
  players = {
    home: [await mk(teamId, "H1", "R30"), await mk(teamId, "H2", "R30"), await mk(teamId, "H3", "R30"), await mk(teamId, "H4", "R30")],
    away: [await mk(extId, "A1", "R30_1"), await mk(extId, "A2", "R30_1"), await mk(extId, "A3", "R30_1"), await mk(extId, "A4", "R30_1")],
  };
});

type Bet = { user: string; match: number; side: "HOME" | "AWAY"; aces: number };

/** Rencontre de 4 simples dans le club (ou un autre), pronostics posés avant le début, puis score confirmé à `settledAt`. */
async function settledEncounter(opts: { winners: ("HOME" | "AWAY" | null)[]; bets: Bet[]; settledAt: Date; matches?: number }) {
  const start = new Date(opts.settledAt.getTime() - 3 * 3_600_000);
  const before = new Date(start.getTime() - 3_600_000);
  const enc = (await createEncounter(capA, { clubTeamId: teamId, opponentTeamId: extId, clubTeamIsHome: true, startsAt: start }, CREATED)).id;
  const ids: string[] = [];
  const n = opts.winners.length;
  for (let i = 0; i < n; i++) ids.push((await addMatch(capA, enc, { homePlayerId: players.home[i]!, awayPlayerId: players.away[i]! }, CREATED)).id);
  await publishEncounter(capA, enc, CREATED);
  for (const b of opts.bets) await placePrediction(b.user, { matchId: ids[b.match]!, side: b.side, committedAces: b.aces }, before);
  const results: MatchResultInput[] = opts.winners.map((w, i) => ({
    matchId: ids[i]!,
    outcome: w ? "COMPLETED" : "NOT_PLAYED",
    winnerSide: w,
    sets: [],
  }));
  const proposeAt = new Date(opts.settledAt.getTime() - 60_000);
  await proposeScore(capA, enc, results, proposeAt);
  await confirmScore(capB, enc, opts.settledAt);
  return { enc, ids };
}

const odds = async (matchId: string, side: "HOME" | "AWAY") => {
  const m = await db.match.findUniqueOrThrow({ where: { id: matchId } });
  return (side === "HOME" ? m.oddsHomeX100 : m.oddsAwayX100)!;
};
const board = (viewer: string, period: "season" | "week", club = clubId) => getLeaderboard(viewer, club, period, { now: NOW });
const names = async (viewer: string, period: "season" | "week") => (await board(viewer, period)).top.map((r) => `${r.rank}:${r.displayName}`);

describe("bénéfice, remboursés et bonus exclus", () => {
  it("calcule gagné − engagé, perdu = −engagé, ignore remboursés, en attente et bonus", async () => {
    const wk = new Date("2026-10-13T15:00:00Z");
    const { ids } = await settledEncounter({
      winners: ["HOME", "AWAY", null, "HOME"],
      bets: [
        { user: ana, match: 0, side: "HOME", aces: 100 }, // gagné
        { user: ana, match: 1, side: "HOME", aces: 50 }, // perdu
        { user: ana, match: 2, side: "HOME", aces: 30 }, // remboursé (non joué)
        { user: ana, match: 3, side: "HOME", aces: 20 }, // gagné
      ],
      settledAt: wk,
    });
    const win0 = computePayout(100, await odds(ids[0]!, "HOME")) - 100;
    const win3 = computePayout(20, await odds(ids[3]!, "HOME")) - 20;
    await grantWeeklyBonus(NOW); // ne doit rien changer
    const r = (await board(ana, "season")).top[0]!;
    expect(r).toMatchObject({ userId: ana, net: win0 - 50 + win3, settled: 3, wins: 2, successRate: 67, rank: 1 });
  });

  it("ne compte pas un pronostic encore en attente (rencontre non confirmée)", async () => {
    const start = new Date("2026-10-20T12:00:00Z");
    const enc = (await createEncounter(capA, { clubTeamId: teamId, opponentTeamId: extId, clubTeamIsHome: true, startsAt: start }, CREATED)).id;
    const m = (await addMatch(capA, enc, { homePlayerId: players.home[0]!, awayPlayerId: players.away[0]! }, CREATED)).id;
    await publishEncounter(capA, enc, CREATED);
    await placePrediction(ana, { matchId: m, side: "HOME", committedAces: 100 }, CREATED);
    expect((await board(ana, "week")).total).toBe(0);
    expect((await board(ana, "season")).total).toBe(0);
  });
});

describe("participation minimale", () => {
  it("saison : 3 pronostics terminés, semaine : 1 ; indique au lecteur ce qui lui manque", async () => {
    await settledEncounter({
      winners: ["HOME", "HOME"],
      bets: [
        { user: ana, match: 0, side: "HOME", aces: 50 },
        { user: ana, match: 1, side: "HOME", aces: 50 },
        { user: bob, match: 0, side: "HOME", aces: 50 },
      ],
      settledAt: new Date("2026-10-13T15:00:00Z"),
    });
    const season = await board(ana, "season");
    expect(season.top).toEqual([]); // 2 < 3
    expect(season.mySettled).toBe(2);
    expect(season.minSettled).toBe(3);
    expect((await names(bob, "week")).length).toBe(2); // 1 suffit pour la semaine
    await settledEncounter({ winners: ["HOME"], bets: [{ user: ana, match: 0, side: "HOME", aces: 50 }], settledAt: new Date("2026-10-13T18:00:00Z") });
    expect((await board(ana, "season")).top.map((r) => r.userId)).toEqual([ana]); // 3 pronostics terminés
  });
});

describe("égalités et tri", () => {
  it("même bénéfice = même rang, départage par victoires puis pseudo", async () => {
    // Mêmes montants et même cote : Bob et Cleo gagnent 1 fois chacun ; Dan perd.
    await settledEncounter({
      winners: ["HOME", "HOME", "HOME", "AWAY"],
      bets: [
        { user: cleo, match: 0, side: "HOME", aces: 100 },
        { user: bob, match: 1, side: "HOME", aces: 100 },
        { user: dan, match: 2, side: "AWAY", aces: 100 },
        { user: ana, match: 3, side: "AWAY", aces: 10 },
      ],
      settledAt: new Date("2026-10-13T15:00:00Z"),
    });
    const rows = (await board(ana, "week")).top;
    const rankOf = (id: string) => rows.find((r) => r.userId === id)!.rank;
    expect(rankOf(bob)).toBe(rankOf(cleo));
    expect(rows.map((r) => r.displayName).slice(0, 2)).toEqual(["Bob", "Cleo"]); // pseudo alphabétique
    expect(rankOf(dan)).toBeGreaterThan(rankOf(bob));
  });
});

describe("périodes", () => {
  const mkBet = (): Bet[] => [{ user: ana, match: 0, side: "HOME", aces: 50 }];

  it("semaine : dimanche 23:59 (Paris) est la semaine précédente, lundi 00:00 est la semaine en cours", async () => {
    await settledEncounter({ winners: ["HOME"], bets: mkBet(), settledAt: new Date("2026-10-11T21:59:00Z") }); // dimanche 23:59
    expect((await board(ana, "week")).total).toBe(0);
    await settledEncounter({ winners: ["HOME"], bets: mkBet(), settledAt: new Date("2026-10-11T22:00:00Z") }); // lundi 00:00
    expect((await board(ana, "week")).top.map((r) => r.settled)).toEqual([1]);
    expect((await board(ana, "season")).mySettled).toBe(2); // la saison compte les deux
  });

  it("une rencontre réglée la semaine prochaine n'est pas dans cette semaine", async () => {
    await settledEncounter({ winners: ["HOME"], bets: mkBet(), settledAt: new Date("2026-10-18T22:00:00Z") }); // lundi 19, 00:00 Paris
    expect((await board(ana, "week")).total).toBe(0);
  });

  it("saison : début inclus, fin exclue", async () => {
    await settledEncounter({ winners: ["HOME"], bets: mkBet(), settledAt: new Date("2026-08-31T21:59:00Z") }); // 31 août 23:59 Paris : avant
    expect((await board(ana, "season")).mySettled).toBe(0);
    await settledEncounter({ winners: ["HOME"], bets: mkBet(), settledAt: new Date("2026-08-31T22:00:00Z") }); // 1er sept 00:00 Paris : dedans
    expect((await board(ana, "season")).mySettled).toBe(1);
    await settledEncounter({ winners: ["HOME"], bets: mkBet(), settledAt: new Date("2027-08-31T22:00:00Z") }); // 1er sept 2027 00:00 : dehors
    expect((await board(ana, "season")).mySettled).toBe(1);
  });

  it("la date de règlement compte, pas celle du pronostic", async () => {
    // Pronostic posé la veille de la semaine, rencontre réglée cette semaine.
    await settledEncounter({ winners: ["HOME"], bets: mkBet(), settledAt: new Date("2026-10-13T15:00:00Z") });
    const p = await db.prediction.findFirstOrThrow({ where: { userId: ana } });
    expect(p.createdAt.getTime()).toBeLessThan(new Date("2026-10-13T00:00:00Z").getTime() + 365 * 86_400_000); // créé « maintenant » réel
    expect((await board(ana, "week")).total).toBe(1);
  });
});

describe("séparation entre clubs et accès", () => {
  it("un pronostic ne compte que dans le classement du club organisateur", async () => {
    await settledEncounter({ winners: ["HOME"], bets: [{ user: ana, match: 0, side: "HOME", aces: 50 }], settledAt: new Date("2026-10-13T15:00:00Z") });
    expect((await board(ana, "week")).total).toBe(1);
    // Ana est aussi membre de l'autre club : rien ne s'y retrouve.
    const other = await db.club.findUniqueOrThrow({ where: { id: otherClubId } });
    await joinClub(ana, other.id);
    expect((await board(ana, "week", otherClubId)).total).toBe(0);
    expect((await board(ana, "season", otherClubId)).mySettled).toBe(0);
  });

  it("réservé aux membres du club", async () => {
    await expect(board(outsider, "season")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(board(ana, "season", "inconnu")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("le classement est à jour dès le règlement, sans autre traitement", async () => {
    expect((await board(ana, "week")).total).toBe(0);
    await settledEncounter({ winners: ["HOME"], bets: [{ user: ana, match: 0, side: "HOME", aces: 50 }], settledAt: new Date("2026-10-13T15:00:00Z") });
    expect((await board(ana, "week")).total).toBe(1);
  });

  it("limite l'affichage et ajoute la ligne du lecteur classé plus bas", async () => {
    await settledEncounter({
      winners: ["HOME", "HOME", "HOME", "AWAY"],
      bets: [
        { user: ana, match: 0, side: "HOME", aces: 300 },
        { user: bob, match: 1, side: "HOME", aces: 200 },
        { user: cleo, match: 2, side: "HOME", aces: 100 },
        { user: dan, match: 3, side: "HOME", aces: 50 }, // perd
      ],
      settledAt: new Date("2026-10-13T15:00:00Z"),
    });
    const v = await getLeaderboard(dan, clubId, "week", { now: NOW, limit: 2 });
    expect(v.top.map((r) => r.displayName)).toEqual(["Ana", "Bob"]);
    expect(v.me).toMatchObject({ displayName: "Dan", rank: 4 });
    expect(v.total).toBe(4);
    expect((await getLeaderboard(ana, clubId, "week", { now: NOW, limit: 2 })).me).toBeNull();
  });
});
