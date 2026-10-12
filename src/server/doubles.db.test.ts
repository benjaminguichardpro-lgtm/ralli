import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { computeDoublesOdds } from "@/lib/odds/model";
import { makeUser } from "../../tests/db/factories";
import { joinClub } from "./club-directory";
import { createClub } from "./clubs";
import { addMatch, createEncounter, getEncounterPage, publishEncounter, removeMatch, replaceMatch } from "./encounters";
import { getBalance } from "./ledger";
import { getWallet, placePrediction } from "./predictions";
import { type MatchResultInput, confirmScore, getScoreView, proposeScore } from "./scores";
import { addNewPlayerToTeam, createExternalTeam, createTeam, deletePlayer, setPlayerAccount } from "./teams";

const T0 = new Date("2026-10-10T10:00:00Z");
const START = new Date("2026-10-12T12:00:00Z");
const BEFORE = new Date("2026-10-12T10:00:00Z");
const AFTER = new Date("2026-10-12T18:00:00Z");

let admin: string, cap: string, capB: string, punter: string, punter2: string;
let clubId: string, teamA: string, teamB: string, ext: string;
let h: string[], hb: string, x: string[];

beforeEach(async () => {
  [admin, cap, capB, punter, punter2] = (await Promise.all(["Admin", "Cap", "CapB", "Parieur", "Parieur2"].map(makeUser))) as string[] as [string, string, string, string, string];
  const club = await createClub(admin, "TC Doubles");
  clubId = club.id;
  for (const u of [cap, capB, punter, punter2]) await joinClub(u, club.id);
  teamA = (await createTeam(admin, clubId, { name: "Messieurs 1", captainUserId: cap })).id;
  teamB = (await createTeam(admin, clubId, { name: "Messieurs 2", captainUserId: capB })).id;
  ext = (await createExternalTeam(admin, clubId, { name: "TC Voisin 1", externalClubName: "TC Voisin" })).id;
  const mk = async (team: string, f: string, l: string, r: "R15_5" | "R30" | "R30_1" | "R30_3" | "NC") =>
    (await addNewPlayerToTeam(admin, team, { firstName: f, lastName: l, fftRank: r })).id;
  h = [await mk(teamA, "Léa", "Martin", "R30"), await mk(teamA, "Hugo", "Durand", "R30_1"), await mk(teamA, "Inès", "Petit", "R15_5"), await mk(teamA, "Tom", "Blanc", "NC")];
  hb = await mk(teamB, "Sam", "Autre", "R30");
  x = [await mk(ext, "Paul", "Voisin", "R30_1"), await mk(ext, "Marc", "Lenoir", "R30_3"), await mk(ext, "Yann", "Roux", "NC"), await mk(ext, "Eli", "Noir", "R30")];
});

const encounter = async () =>
  (await createEncounter(cap, { clubTeamId: teamA, opponentTeamId: ext, clubTeamIsHome: true, startsAt: START }, T0)).id;
const double = (home: [string, string], away: [string, string], points?: number) => ({
  homePlayerId: home[0],
  homePlayer2Id: home[1],
  awayPlayerId: away[0],
  awayPlayer2Id: away[1],
  points,
});
const matchRow = (id: string) => db.match.findUniqueOrThrow({ where: { id } });

describe("composition d'un double", () => {
  it("quatre joueurs des deux équipes, valant 1 point par défaut", async () => {
    const e = await encounter();
    const m = await addMatch(cap, e, double([h[0]!, h[1]!], [x[0]!, x[1]!]), T0);
    expect(await matchRow(m.id)).toMatchObject({
      kind: "DOUBLES",
      points: 1,
      homePlayerId: h[0],
      homePlayer2Id: h[1],
      awayPlayerId: x[0],
      awayPlayer2Id: x[1],
    });
    const two = await addMatch(cap, e, double([h[2]!, h[3]!], [x[2]!, x[3]!], 2), T0);
    expect((await matchRow(two.id)).points).toBe(2);
  });

  it("uniquement des gens de l'équipe : un joueur d'une autre équipe est refusé, de chaque côté", async () => {
    const e = await encounter();
    await expect(addMatch(cap, e, double([h[0]!, hb], [x[0]!, x[1]!]), T0)).rejects.toThrow("Les joueurs domicile doivent faire partie de l'effectif de");
    await expect(addMatch(cap, e, double([h[0]!, h[1]!], [x[0]!, h[2]!]), T0)).rejects.toThrow("Les joueurs extérieur doivent faire partie de l'effectif de");
    expect(await db.match.count({ where: { encounterId: e } })).toBe(0);
  });

  it("refuse un double incomplet, une paire de deux fois le même joueur et un nombre de points invalide", async () => {
    const e = await encounter();
    await expect(addMatch(cap, e, { homePlayerId: h[0]!, homePlayer2Id: h[1]!, awayPlayerId: x[0]! }, T0)).rejects.toThrow("deux joueurs de chaque côté");
    await expect(addMatch(cap, e, double([h[0]!, h[0]!], [x[0]!, x[1]!]), T0)).rejects.toThrow("doivent être différents");
    await expect(addMatch(cap, e, double([h[0]!, h[1]!], [x[0]!, x[0]!]), T0)).rejects.toThrow("doivent être différents");
    await expect(addMatch(cap, e, double([h[0]!, h[1]!], [x[0]!, x[1]!], 3), T0)).rejects.toThrow("1 ou 2 points");
    await expect(addMatch(cap, e, double([h[0]!, h[1]!], [x[0]!, x[1]!], 0), T0)).rejects.toThrow("1 ou 2 points");
  });

  it("un joueur : au plus un simple ET un double ; pas deux simples, pas deux doubles", async () => {
    const e = await encounter();
    await addMatch(cap, e, { homePlayerId: h[0]!, awayPlayerId: x[0]! }, T0);
    await addMatch(cap, e, double([h[0]!, h[1]!], [x[0]!, x[1]!]), T0); // h0 et x0 : un simple et un double, c'est permis
    await expect(addMatch(cap, e, { homePlayerId: h[0]!, awayPlayerId: x[2]! }, T0)).rejects.toThrow("déjà un simple");
    await expect(addMatch(cap, e, double([h[0]!, h[2]!], [x[2]!, x[3]!]), T0)).rejects.toThrow("déjà un double");
    await expect(addMatch(cap, e, double([h[2]!, h[3]!], [x[1]!, x[3]!]), T0)).rejects.toThrow("déjà un double"); // x1 est le 2e joueur du premier double
    await addMatch(cap, e, double([h[2]!, h[3]!], [x[2]!, x[3]!]), T0);
  });

  it("seuls l'admin et le capitaine de l'équipe composent", async () => {
    const e = await encounter();
    await expect(addMatch(capB, e, double([h[0]!, h[1]!], [x[0]!, x[1]!]), T0)).rejects.toThrow("Réservé au capitaine");
    await expect(addMatch(punter, e, double([h[0]!, h[1]!], [x[0]!, x[1]!]), T0)).rejects.toThrow("Réservé au capitaine");
    await addMatch(admin, e, double([h[0]!, h[1]!], [x[0]!, x[1]!]), T0);
  });
});

describe("modifier, retirer, points", () => {
  it("brouillon : un double se modifie sur place (joueurs et points) ; il reste un double", async () => {
    const e = await encounter();
    const m = await addMatch(cap, e, double([h[0]!, h[1]!], [x[0]!, x[1]!]), T0);
    await replaceMatch(cap, m.id, double([h[2]!, h[3]!], [x[2]!, x[3]!], 2), T0);
    expect(await matchRow(m.id)).toMatchObject({ kind: "DOUBLES", points: 2, homePlayerId: h[2], homePlayer2Id: h[3] });
    await expect(replaceMatch(cap, m.id, { homePlayerId: h[0]!, awayPlayerId: x[0]! }, T0)).rejects.toThrow("ne devient pas un simple");
    const single = await addMatch(cap, e, { homePlayerId: h[0]!, awayPlayerId: x[0]! }, T0);
    await expect(replaceMatch(cap, single.id, double([h[0]!, h[1]!], [x[0]!, x[1]!]), T0)).rejects.toThrow("ne devient pas un double");
    await removeMatch(cap, m.id, T0);
    expect(await db.match.count({ where: { encounterId: e, kind: "DOUBLES" } })).toBe(0);
  });

  it("publié : modifier un double annule l'ancien (pronostics remboursés) et crée le nouveau avec ses cotes", async () => {
    const e = await encounter();
    const m = await addMatch(cap, e, double([h[0]!, h[1]!], [x[0]!, x[1]!]), T0);
    await addMatch(cap, e, { homePlayerId: h[2]!, awayPlayerId: x[2]! }, T0);
    await publishEncounter(cap, e, T0);
    await placePrediction(punter, { matchId: m.id, side: "HOME", committedAces: 100 }, BEFORE);
    expect(await getBalance(punter)).toBe(900);
    const r = await replaceMatch(cap, m.id, double([h[2]!, h[3]!], [x[2]!, x[3]!], 2), BEFORE);
    expect(r.refunded).toBe(1);
    expect(await getBalance(punter)).toBe(1000);
    expect((await matchRow(m.id)).voidedAt).not.toBeNull();
    const fresh = await matchRow(r.id);
    expect(fresh).toMatchObject({ kind: "DOUBLES", points: 2 });
    expect(fresh.oddsHomeX100).not.toBeNull();
  });
});

describe("cotes d'un double", () => {
  it("figées à la publication : moyenne des niveaux de chaque paire, sans forme ni confrontations", async () => {
    const e = await encounter();
    const m = await addMatch(cap, e, double([h[0]!, h[1]!], [x[0]!, x[1]!]), T0); // 30 et 30/1 contre 30/1 et 30/3
    await publishEncounter(cap, e, T0);
    const row = await matchRow(m.id);
    const expected = computeDoublesOdds({ ranksA: ["R30", "R30_1"], ranksB: ["R30_1", "R30_3"] });
    expect([row.oddsHomeX100, row.oddsAwayX100]).toEqual([expected.oddsX100A, expected.oddsX100B]);
    expect(row.oddsInputs).toMatchObject({ kind: "DOUBLES", ranksHome: ["R30", "R30_1"], ranksAway: ["R30_1", "R30_3"] });
  });

  it("un double ne nourrit pas la forme ni les confrontations des simples", async () => {
    const first = await encounter();
    const dbl = await addMatch(cap, first, double([h[0]!, h[1]!], [x[0]!, x[1]!]), T0);
    await publishEncounter(cap, first, T0);
    await proposeScore(cap, first, [{ matchId: dbl.id, outcome: "COMPLETED", winnerSide: "HOME", sets: [] }], AFTER);
    await confirmScore(admin, first, AFTER);

    const later = (await createEncounter(cap, { clubTeamId: teamA, opponentTeamId: ext, clubTeamIsHome: true, startsAt: new Date("2026-10-20T12:00:00Z") }, T0)).id;
    const single = await addMatch(cap, later, { homePlayerId: h[0]!, awayPlayerId: x[0]! }, T0);
    await publishEncounter(cap, later, new Date("2026-10-19T12:00:00Z"));
    const inputs = (await matchRow(single.id)).oddsInputs as { formHome: string[]; formAway: string[]; h2h: { winsA: number; winsB: number } };
    expect(inputs.formHome).toEqual([]);
    expect(inputs.formAway).toEqual([]);
    expect(inputs.h2h).toEqual({ winsA: 0, winsB: 0 });
  });
});

describe("anti-trucage", () => {
  it("un compte lié à l'un des quatre joueurs d'un double ne peut pronostiquer aucun match de la rencontre", async () => {
    const e = await encounter();
    const dbl = await addMatch(cap, e, double([h[0]!, h[1]!], [x[0]!, x[1]!]), T0);
    const single = await addMatch(cap, e, { homePlayerId: h[2]!, awayPlayerId: x[2]! }, T0);
    await setPlayerAccount(admin, h[1]!, punter); // 2e joueur domicile du double
    await publishEncounter(cap, e, T0);
    await expect(placePrediction(punter, { matchId: dbl.id, side: "HOME", committedAces: 10 }, BEFORE)).rejects.toThrow("aligné");
    await expect(placePrediction(punter, { matchId: single.id, side: "HOME", committedAces: 10 }, BEFORE)).rejects.toThrow("aligné");
    await placePrediction(punter2, { matchId: dbl.id, side: "AWAY", committedAces: 10 }, BEFORE);
  });

  it("le lien fiche ↔ compte est gelé pour un joueur qui n'est qu'en double ; sa fiche ne se supprime pas", async () => {
    const e = await encounter();
    await addMatch(cap, e, double([h[0]!, h[1]!], [x[0]!, x[1]!]), T0);
    await publishEncounter(cap, e, T0);
    await expect(setPlayerAccount(admin, h[1]!, punter)).rejects.toMatchObject({ code: "PLAYER_LOCKED" });
    await expect(deletePlayer(admin, h[1]!)).rejects.toMatchObject({ code: "PLAYER_HAS_MATCHES" });
    await expect(deletePlayer(admin, x[1]!)).rejects.toMatchObject({ code: "PLAYER_HAS_MATCHES" });
    await deletePlayer(admin, h[3]!); // jamais aligné : supprimable
  });
});

describe("affichage et score", () => {
  it("la page met les simples avant les doubles, numérote par type et affiche « Prénom N. / Prénom N. »", async () => {
    const e = await encounter();
    await addMatch(cap, e, double([h[0]!, h[1]!], [x[0]!, x[1]!], 2), T0);
    await addMatch(cap, e, { homePlayerId: h[2]!, awayPlayerId: x[2]! }, T0);
    await addMatch(cap, e, { homePlayerId: h[3]!, awayPlayerId: x[3]! }, T0);
    const page = await getEncounterPage(cap, e, T0);
    expect(page.matches.map((m) => `${m.kind}:${m.number}`)).toEqual(["SINGLES:1", "SINGLES:2", "DOUBLES:1"]);
    const d = page.matches[2]!;
    expect(d.home.name).toBe("Léa M. / Hugo D.");
    expect(d.away.name).toBe("Paul V. / Marc L.");
    expect(d.home.rank).toBe("30 · 30/1");
    expect(d.points).toBe(2);
    expect(page.manage!.matches.find((m) => m.kind === "DOUBLES")).toMatchObject({ homePlayer2Id: h[1], awayPlayer2Id: x[1], points: 2 });
  });

  it("score final en points : un double vaut 1 ou 2, un match sans vainqueur ne rapporte rien", async () => {
    const e = await encounter();
    const s1 = await addMatch(cap, e, { homePlayerId: h[2]!, awayPlayerId: x[2]! }, T0); // 1 point
    const d1 = await addMatch(cap, e, double([h[0]!, h[1]!], [x[0]!, x[1]!], 2), T0); // 2 points
    const d2 = await addMatch(cap, e, double([h[2]!, h[3]!], [x[2]!, x[3]!], 2), T0); // 2 points, non joué
    await publishEncounter(cap, e, T0);
    const results: MatchResultInput[] = [
      { matchId: s1.id, outcome: "COMPLETED", winnerSide: "HOME", sets: [] },
      { matchId: d1.id, outcome: "COMPLETED", winnerSide: "AWAY", sets: [] },
      { matchId: d2.id, outcome: "NOT_PLAYED", winnerSide: null, sets: [] },
    ];
    await proposeScore(cap, e, results, AFTER);
    await confirmScore(admin, e, AFTER);
    const view = await getScoreView(admin, e, AFTER);
    expect(view.tally).toEqual({ home: 1, away: 2 });
    expect(view.matches.map((m) => `${m.kind}:${m.number}:${m.points}`)).toEqual(["SINGLES:1:1", "DOUBLES:1:2", "DOUBLES:2:2"]);
  });

  it("le pronostic sur un double se règle comme un simple, et le portefeuille nomme la paire", async () => {
    const e = await encounter();
    const d = await addMatch(cap, e, double([h[0]!, h[1]!], [x[0]!, x[1]!]), T0);
    await publishEncounter(cap, e, T0);
    const pr = await placePrediction(punter, { matchId: d.id, side: "AWAY", committedAces: 100 }, BEFORE);
    const odds = (await matchRow(d.id)).oddsAwayX100!;
    const pending = await getWallet(punter);
    expect(pending.pending[0]).toMatchObject({ matchLabel: "Léa M. / Hugo D. contre Paul V. / Marc L.", pickedName: "Paul V. / Marc L." });

    await proposeScore(cap, e, [{ matchId: d.id, outcome: "COMPLETED", winnerSide: "AWAY", sets: [] }], AFTER);
    await confirmScore(admin, e, AFTER);
    const settled = await db.prediction.findUniqueOrThrow({ where: { id: pr.id } });
    expect(settled.status).toBe("WON");
    expect(settled.payoutAces).toBe(Math.floor((100 * odds + 50) / 100));
  });
});

describe("garde-fous de la base", () => {
  const base = (patch: Record<string, unknown>) => async () => {
    const e = await encounter();
    return db.match.create({
      data: { encounterId: e, order: 1, homePlayerId: h[0]!, awayPlayerId: x[0]!, ...patch } as never,
    });
  };

  it("un double sans ses deux joueurs supplémentaires, ou un simple qui en a un : refusé", async () => {
    await expect(base({ kind: "DOUBLES" })()).rejects.toThrow();
    await expect(base({ kind: "DOUBLES", homePlayer2Id: h[1] })()).rejects.toThrow();
    await expect(base({ kind: "SINGLES", homePlayer2Id: h[1], awayPlayer2Id: x[1] })()).rejects.toThrow();
  });

  it("deux fois le même joueur dans une paire, ou un nombre de points hors 1 ou 2 : refusé", async () => {
    await expect(base({ kind: "DOUBLES", homePlayer2Id: h[0], awayPlayer2Id: x[1] })()).rejects.toThrow();
    await expect(base({ points: 3 })()).rejects.toThrow();
    await expect(base({ points: 0 })()).rejects.toThrow();
  });
});
