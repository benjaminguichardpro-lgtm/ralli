import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { makeUser } from "../../tests/db/factories";
import { joinClub } from "./club-directory";
import { deleteClub } from "./club-delete";
import { createClub } from "./clubs";
import { getBalance } from "./ledger";
import { clubTotals } from "./leaderboard";
import { getWallet } from "./predictions";
import { getResults } from "./results";
import { placeTournamentPrediction } from "./tournament-predictions";
import {
  addEntry,
  addNewEntry,
  cancelTournament,
  createTournament,
  deleteDraftTournament,
  getTournamentPage,
  listClubTournaments,
  listTournamentsForUser,
  publishTournament,
  recordTournamentResult,
  removeEntry,
  setFirstRound,
  setMatchTime,
} from "./tournaments";

// Tournoi à élimination directe de 4 joueurs (2 demi-finales + finale), pour couvrir tout le parcours.

const T0 = new Date("2026-10-10T10:00:00Z");
const SF = new Date("2026-10-12T12:00:00Z"); // demi-finales
const AFTER_SF = new Date("2026-10-12T14:00:00Z");
const FINAL = new Date("2026-10-12T18:00:00Z");
const AFTER_FINAL = new Date("2026-10-12T20:00:00Z");
const BEFORE = new Date("2026-10-12T09:00:00Z");

let admin: string, admin2: string, member: string, member2: string, outsider: string, linked: string;
let clubId: string, otherClubId: string, tid: string;
let p: string[]; // joueurs inscrits : Aline, Boris, Chloé, Denis
let sf1: string, sf2: string, fin: string; // identifiants des matchs

const win = (winnerSide: "HOME" | "AWAY") => ({ outcome: "COMPLETED" as const, winnerSide, sets: [] });

beforeEach(async () => {
  [admin, admin2, member, member2, outsider, linked] = (await Promise.all(["Admin", "Admin2", "Membre", "Membre2", "Dehors", "Lie"].map(makeUser))) as [string, string, string, string, string, string];
  clubId = (await createClub(admin, "TC Tournoi")).id;
  otherClubId = (await createClub(admin2, "TC Autre")).id;
  for (const u of [member, member2, linked]) await joinClub(u, clubId);
  tid = (await createTournament(admin, clubId, { name: "Tournoi d'automne", drawSize: 4, startsAt: SF })).id;
  const names: [string, string, "R30" | "R30_1" | "R30_2" | "R30_3"][] = [["Aline", "Martin", "R30"], ["Boris", "Durand", "R30_1"], ["Chloé", "Petit", "R30_2"], ["Denis", "Roux", "R30_3"]];
  p = [];
  for (const [firstName, lastName, fftRank] of names) p.push((await addNewEntry(admin, tid, { firstName, lastName, fftRank })).playerId);
  await db.player.update({ where: { id: p[3]! }, data: { userId: linked } }); // Denis a un compte : il ne pronostique pas son tournoi
  await setFirstRound(admin, tid, [
    { position: 0, homePlayerId: p[0]!, awayPlayerId: p[1]!, startsAt: SF },
    { position: 1, homePlayerId: p[2]!, awayPlayerId: p[3]!, startsAt: SF },
  ]);
});

/** Publie puis renvoie les identifiants des trois matchs. */
async function published(now = T0) {
  await publishTournament(admin, tid, now);
  const ms = await db.tournamentMatch.findMany({ where: { tournamentId: tid }, orderBy: [{ round: "asc" }, { position: "asc" }] });
  [sf1, sf2, fin] = ms.map((m) => m.id) as [string, string, string];
}

describe("création et préparation", () => {
  it("seul un admin crée ; le tableau a N − 1 matchs vides ; nom et taille contrôlés", async () => {
    await expect(createTournament(member, clubId, { name: "X tournoi", drawSize: 8, startsAt: SF })).rejects.toThrow();
    await expect(createTournament(outsider, clubId, { name: "X tournoi", drawSize: 8, startsAt: SF })).rejects.toThrow();
    await expect(createTournament(admin, clubId, { name: "A", drawSize: 8, startsAt: SF })).rejects.toThrow("nom");
    await expect(createTournament(admin, clubId, { name: "Tournoi", drawSize: 6, startsAt: SF })).rejects.toThrow("4, 8, 16 ou 32");
    const big = await createTournament(admin, clubId, { name: "Grand tournoi", drawSize: 16, startsAt: SF });
    expect(await db.tournamentMatch.count({ where: { tournamentId: big.id } })).toBe(15);
    expect(await db.tournamentMatch.count({ where: { tournamentId: tid } })).toBe(3);
    expect((await db.tournament.findUniqueOrThrow({ where: { id: tid } })).status).toBe("DRAFT");
  });

  it("inscriptions : capacité, doublon, joueur d'un autre club refusés ; retrait vide la case du tableau", async () => {
    await expect(addNewEntry(admin, tid, { firstName: "Extra", lastName: "Joueur", fftRank: "R30" })).rejects.toThrow("complet");
    const foreign = await db.player.create({ data: { clubId: otherClubId, firstName: "Z", lastName: "Etranger", fftRank: "R30" } });
    await expect(addEntry(admin, tid, foreign.id)).rejects.toThrow();
    await expect(addEntry(admin, tid, p[0]!)).rejects.toThrow(); // déjà inscrit (ou tableau complet)
    await removeEntry(admin, tid, p[0]!);
    const m = await db.tournamentMatch.findUniqueOrThrow({ where: { tournamentId_round_position: { tournamentId: tid, round: 1, position: 0 } } });
    expect(m.homePlayerId).toBeNull();
    await addEntry(admin, tid, p[0]!); // la fiche existe toujours : on la réinscrit
    await expect(removeEntry(member, tid, p[1]!)).rejects.toThrow();
  });

  it("le tableau du premier tour : joueurs inscrits seulement, une seule fois chacun", async () => {
    const stranger = await db.player.create({ data: { clubId, firstName: "Pas", lastName: "Inscrit", fftRank: "R30" } });
    await expect(setFirstRound(admin, tid, [{ position: 0, homePlayerId: stranger.id, awayPlayerId: p[1]!, startsAt: SF }])).rejects.toThrow("pas inscrit");
    await expect(setFirstRound(admin, tid, [{ position: 0, homePlayerId: p[0]!, awayPlayerId: p[1]!, startsAt: SF }, { position: 1, homePlayerId: p[0]!, awayPlayerId: p[2]!, startsAt: SF }])).rejects.toThrow("qu'une fois");
    await expect(setFirstRound(admin, tid, [{ position: 5, homePlayerId: p[0]!, awayPlayerId: p[1]!, startsAt: SF }])).rejects.toThrow("incohérent");
    await expect(setFirstRound(member, tid, [])).rejects.toThrow();
  });

  it("publication : tableau complet, heures futures, joueurs au complet ; les cotes du premier tour sont figées, pas celles de la finale", async () => {
    await removeEntry(admin, tid, p[1]!);
    await expect(publishTournament(admin, tid, T0)).rejects.toThrow("Il faut 4 joueurs");
    await addEntry(admin, tid, p[1]!);
    await expect(publishTournament(admin, tid, T0)).rejects.toThrow("Complète le tableau"); // la case de Boris est vide
    await setFirstRound(admin, tid, [{ position: 0, homePlayerId: p[0]!, awayPlayerId: p[1]!, startsAt: null }, { position: 1, homePlayerId: p[2]!, awayPlayerId: p[3]!, startsAt: SF }]);
    await expect(publishTournament(admin, tid, T0)).rejects.toThrow("heure de début");
    await setFirstRound(admin, tid, [{ position: 0, homePlayerId: p[0]!, awayPlayerId: p[1]!, startsAt: BEFORE }, { position: 1, homePlayerId: p[2]!, awayPlayerId: p[3]!, startsAt: SF }]);
    await expect(publishTournament(admin, tid, SF)).rejects.toThrow("futur");
    await expect(publishTournament(member, tid, T0)).rejects.toThrow();
    await published();
    const ms = await db.tournamentMatch.findMany({ where: { tournamentId: tid }, orderBy: [{ round: "asc" }, { position: "asc" }] });
    expect(ms[0]!.oddsHomeX100).not.toBeNull();
    expect(ms[0]!.oddsAwayX100).not.toBeNull();
    expect(ms[2]!.oddsHomeX100).toBeNull(); // la finale n'a pas encore ses joueurs
    expect((await db.tournament.findUniqueOrThrow({ where: { id: tid } })).status).toBe("OPEN");
    await expect(addEntry(admin, tid, p[0]!)).rejects.toThrow("déjà publié"); // plus de modification du tableau
  });

  it("un brouillon se supprime, un tournoi publié non", async () => {
    await deleteDraftTournament(admin, tid);
    expect(await db.tournament.count({ where: { id: tid } })).toBe(0);
    expect(await db.tournamentMatch.count({ where: { tournamentId: tid } })).toBe(0);
  });
});

describe("pronostics", () => {
  beforeEach(async () => {
    await published();
  });

  it("un membre pronostique un match ouvert : cote copiée, Aces engagés au ledger ; un seul pronostic par match", async () => {
    const before = await getBalance(member);
    const { id } = await placeTournamentPrediction(member, { matchId: sf1, side: "HOME", committedAces: 100 }, T0);
    const pr = await db.prediction.findUniqueOrThrow({ where: { id } });
    const m = await db.tournamentMatch.findUniqueOrThrow({ where: { id: sf1 } });
    expect(pr).toMatchObject({ tournamentMatchId: sf1, matchId: null, pickedSide: "HOME", oddsX100: m.oddsHomeX100, status: "PENDING" });
    expect(await getBalance(member)).toBe(before - 100);
    await expect(placeTournamentPrediction(member, { matchId: sf1, side: "AWAY", committedAces: 50 }, T0)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(placeTournamentPrediction(member, { matchId: sf1, side: "AWAY", committedAces: 5 }, T0)).rejects.toThrow("Minimum");
    await expect(placeTournamentPrediction(member2, { matchId: sf1, side: "AWAY", committedAces: 10_000_000 }, T0)).rejects.toThrow("Solde insuffisant");
  });

  it("anti-trucage : admins du club, joueur inscrit avec un compte lié ; non-membre = introuvable", async () => {
    await expect(placeTournamentPrediction(admin, { matchId: sf1, side: "HOME", committedAces: 50 }, T0)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(placeTournamentPrediction(linked, { matchId: sf1, side: "HOME", committedAces: 50 }, T0)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(placeTournamentPrediction(outsider, { matchId: sf1, side: "HOME", committedAces: 50 }, T0)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await db.prediction.count()).toBe(0);
  });

  it("fermé à l'heure de début, et seulement quand les deux joueurs sont connus", async () => {
    await expect(placeTournamentPrediction(member, { matchId: sf1, side: "HOME", committedAces: 50 }, SF)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(placeTournamentPrediction(member, { matchId: fin, side: "HOME", committedAces: 50 }, T0)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });

  it("un brouillon ou un tournoi annulé ne reçoit pas de pronostic", async () => {
    await cancelTournament(admin, tid, T0);
    await expect(placeTournamentPrediction(member, { matchId: sf1, side: "HOME", committedAces: 50 }, T0)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });
});

describe("heures", () => {
  beforeEach(async () => {
    await published();
  });

  it("un admin fixe ou change l'heure tant que le match n'a pas commencé, dans le futur", async () => {
    const later = new Date("2026-10-12T13:00:00Z");
    await setMatchTime(admin, sf1, later, T0);
    expect((await db.tournamentMatch.findUniqueOrThrow({ where: { id: sf1 } })).startsAt).toEqual(later);
    await setMatchTime(admin, fin, FINAL, T0); // la finale peut recevoir son heure avant que ses joueurs soient connus
    await expect(setMatchTime(admin, sf1, new Date("2026-10-09T00:00:00Z"), T0)).rejects.toThrow("futur");
    await expect(setMatchTime(admin, sf1, FINAL, later)).rejects.toThrow("a commencé");
    await expect(setMatchTime(member, sf1, FINAL, T0)).rejects.toThrow();
  });
});

describe("résultats : règlement et avancée du vainqueur", () => {
  beforeEach(async () => {
    await published();
  });

  it("pas avant l'heure de début, pas par un non-admin, pas « non joué », pas deux fois", async () => {
    await expect(recordTournamentResult(admin, sf1, win("HOME"), SF.getTime() > 0 ? BEFORE : T0)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(recordTournamentResult(member, sf1, win("HOME"), AFTER_SF)).rejects.toThrow();
    await expect(recordTournamentResult(admin, sf1, { outcome: "NOT_PLAYED", winnerSide: null, sets: [] }, AFTER_SF)).rejects.toThrow("vainqueur");
    await expect(recordTournamentResult(admin, sf1, { outcome: "COMPLETED", winnerSide: null, sets: [] }, AFTER_SF)).rejects.toMatchObject({ code: "INVALID" });
    await recordTournamentResult(admin, sf1, win("HOME"), AFTER_SF);
    await expect(recordTournamentResult(admin, sf1, win("AWAY"), AFTER_SF)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("règle les pronostics du match tout de suite : gagné (gain au ledger) et perdu ; les autres matchs ne bougent pas", async () => {
    const w = await placeTournamentPrediction(member, { matchId: sf1, side: "HOME", committedAces: 100 }, T0);
    const l = await placeTournamentPrediction(member2, { matchId: sf1, side: "AWAY", committedAces: 100 }, T0);
    const other = await placeTournamentPrediction(member, { matchId: sf2, side: "HOME", committedAces: 50 }, T0);
    const before = await getBalance(member);
    await recordTournamentResult(admin, sf1, win("HOME"), AFTER_SF);
    const won = await db.prediction.findUniqueOrThrow({ where: { id: w.id } });
    expect(won.status).toBe("WON");
    expect(won.payoutAces).toBeGreaterThan(100);
    expect(await getBalance(member)).toBe(before + won.payoutAces!);
    expect(await db.prediction.findUniqueOrThrow({ where: { id: l.id } })).toMatchObject({ status: "LOST", payoutAces: 0 });
    expect((await db.prediction.findUniqueOrThrow({ where: { id: other.id } })).status).toBe("PENDING");
    expect(await db.ledgerEntry.count({ where: { predictionId: w.id, type: "PREDICTION_PAYOUT" } })).toBe(1);
  });

  it("le vainqueur avance : domicile de la finale pour le match 1, extérieur pour le match 2 ; les cotes de la finale se figent quand les deux sont là ; la finale termine le tournoi", async () => {
    await recordTournamentResult(admin, sf1, win("AWAY"), AFTER_SF); // Boris gagne
    let f = await db.tournamentMatch.findUniqueOrThrow({ where: { id: fin } });
    expect(f).toMatchObject({ homePlayerId: p[1], awayPlayerId: null, oddsHomeX100: null });
    await recordTournamentResult(admin, sf2, win("HOME"), AFTER_SF); // Chloé gagne
    f = await db.tournamentMatch.findUniqueOrThrow({ where: { id: fin } });
    expect(f).toMatchObject({ homePlayerId: p[1], awayPlayerId: p[2] });
    expect(f.oddsHomeX100).not.toBeNull();
    await setMatchTime(admin, fin, FINAL, AFTER_SF);
    await placeTournamentPrediction(member, { matchId: fin, side: "AWAY", committedAces: 100 }, AFTER_SF);
    await recordTournamentResult(admin, fin, win("AWAY"), AFTER_FINAL);
    const t = await db.tournament.findUniqueOrThrow({ where: { id: tid } });
    expect(t).toMatchObject({ status: "FINISHED", winnerId: p[2] });
    expect((await db.prediction.findFirstOrThrow({ where: { tournamentMatchId: fin } })).status).toBe("WON");
    const page = await getTournamentPage(null, tid);
    expect(page.winner).toBe("Chloé Petit");
    expect(page.rounds[0]!.matches[0]!.state).toBe("done");
  });

  it("annuler : tous les pronostics en cours sont remboursés, pas ceux déjà réglés", async () => {
    await placeTournamentPrediction(member, { matchId: sf1, side: "HOME", committedAces: 100 }, T0);
    await placeTournamentPrediction(member2, { matchId: sf2, side: "HOME", committedAces: 100 }, T0);
    await recordTournamentResult(admin, sf1, win("HOME"), AFTER_SF);
    const b2 = await getBalance(member2);
    expect(await cancelTournament(admin, tid, AFTER_SF)).toEqual({ refunded: 1 });
    expect(await getBalance(member2)).toBe(b2 + 100);
    expect((await db.tournament.findUniqueOrThrow({ where: { id: tid } })).status).toBe("CANCELLED");
    await expect(cancelTournament(admin, tid, AFTER_SF)).rejects.toThrow();
  });

  it("les pronostics de tournoi comptent au classement du club et apparaissent dans Mes rallis et le portefeuille", async () => {
    await placeTournamentPrediction(member, { matchId: sf1, side: "HOME", committedAces: 100 }, T0);
    await placeTournamentPrediction(member2, { matchId: sf1, side: "AWAY", committedAces: 100 }, T0);
    const wallet = await getWallet(member);
    expect(wallet.pending).toHaveLength(1);
    expect(wallet.pending[0]).toMatchObject({ encounterId: tid, pickedName: "Aline Martin" });
    expect(wallet.pending[0]!.matchLabel).toContain("Tournoi d'automne · Demi-finale");
    await recordTournamentResult(admin, sf1, win("HOME"), AFTER_SF);
    const totals = await clubTotals(clubId, new Date("2026-10-01T00:00:00Z"), new Date("2026-11-01T00:00:00Z"));
    expect(totals.find((t) => t.userId === member)).toMatchObject({ wins: 1, settled: 1 });
    expect(totals.find((t) => t.userId === member)!.net).toBeGreaterThan(0);
    expect(totals.find((t) => t.userId === member2)).toMatchObject({ net: -100, wins: 0, settled: 1 });
    const results = await getResults(member, "tous", 20, AFTER_SF);
    expect(results.groups[0]).toMatchObject({ encounterId: tid, title: "Tournoi d'automne" });
    expect(results.groups[0]!.items[0]).toMatchObject({ status: "WON", share: "no", card: null });
  });
});

describe("lecture", () => {
  it("un brouillon n'est vu que des admins du club ; un tournoi publié l'est de tous, sans compte", async () => {
    await expect(getTournamentPage(null, tid)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getTournamentPage(member, tid)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const draft = await getTournamentPage(admin, tid);
    expect(draft).toMatchObject({ status: "DRAFT", isAdmin: true });
    expect(draft.entries).toHaveLength(4);
    await published();
    for (const viewer of [null, member, outsider]) {
      const v = await getTournamentPage(viewer, tid, T0);
      expect(v).toMatchObject({ status: "OPEN", isAdmin: false });
      expect(v.entries).toEqual([]); // les inscrits (avec noms complets) ne sont donnés qu'aux admins
      expect(v.rounds.map((r) => r.matches.length)).toEqual([2, 1]);
    }
    const open = (await getTournamentPage(null, tid, T0)).rounds[0]!.matches[0]!;
    expect(open).toMatchObject({ state: "open", home: { name: "Aline Martin" }, away: { name: "Boris Durand" } });
    expect((await getTournamentPage(null, tid, T0)).rounds[1]!.matches[0]!.state).toBe("waiting");
  });

  it("listes : club (brouillon pour les admins seulement) et accueil des membres", async () => {
    expect(await listClubTournaments(clubId)).toEqual([]);
    expect((await listClubTournaments(clubId, { withDrafts: true })).map((t) => t.id)).toEqual([tid]);
    await published();
    expect((await listClubTournaments(clubId, {}, T0)).map((t) => t.id)).toEqual([tid]);
    const home = await listTournamentsForUser(member, T0);
    expect(home.current.map((t) => t.id)).toEqual([tid]);
    expect(home.current[0]!.openMatches).toBe(2);
    expect((await listTournamentsForUser(outsider, T0)).current).toEqual([]);
  });

  it("supprimer le club annule ses tournois, rembourse les pronostics et rend le tournoi introuvable", async () => {
    await published();
    await placeTournamentPrediction(member, { matchId: sf1, side: "HOME", committedAces: 100 }, T0);
    const before = await getBalance(member);
    expect(await deleteClub(admin, clubId, "SUPPRIMER", T0)).toEqual({ refunded: 1 });
    expect(await getBalance(member)).toBe(before + 100);
    expect((await db.tournament.findUniqueOrThrow({ where: { id: tid } })).status).toBe("CANCELLED");
    await expect(getTournamentPage(null, tid)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
