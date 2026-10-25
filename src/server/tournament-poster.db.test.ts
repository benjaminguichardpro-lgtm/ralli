import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { makeUser } from "../../tests/db/factories";
import { joinClub } from "./club-directory";
import { listClubPlayers } from "./club-players";
import { createClub } from "./clubs";
import { getTournamentPoster } from "./tournament-poster";
import {
  addEntry,
  addNewEntry,
  addReferee,
  cancelTournament,
  createTournament,
  deleteDraftTournament,
  getTournamentPage,
  getTournamentPanel,
  publishTournament,
  recordTournamentResult,
  removeReferee,
  setFirstRound,
  setMatchTime,
  setTournamentInfo,
} from "./tournaments";

// Juges-arbitres (nommés par un admin, mêmes droits de préparation et de score que les admins, pas ceux de publier ni d'annuler)
// et affiche du tournoi (lecture du tableau : une seule saisie).

const T0 = new Date("2026-10-10T10:00:00Z");
const SF = new Date("2026-10-12T12:00:00Z");
const AFTER_SF = new Date("2026-10-12T14:00:00Z");
const FINAL = new Date("2026-10-12T18:00:00Z");
const AFTER_FINAL = new Date("2026-10-12T20:00:00Z");

let admin: string, referee: string, member: string, outsider: string, otherAdmin: string;
let clubId: string, tid: string;

const win = (winnerSide: "HOME" | "AWAY", sets: { home: number; away: number }[] = []) => ({ outcome: "COMPLETED" as const, winnerSide, sets });

beforeEach(async () => {
  [admin, referee, member, outsider, otherAdmin] = (await Promise.all(["Admin", "Arbitre", "Membre", "Dehors", "AdminB"].map(makeUser))) as [string, string, string, string, string];
  clubId = (await createClub(admin, "TC Affiche")).id;
  await createClub(otherAdmin, "TC Ailleurs");
  for (const u of [referee, member]) await joinClub(u, clubId);
  tid = (await createTournament(admin, clubId, { name: "Tournoi de l'affiche", drawSize: 4, startsAt: SF })).id;
});

/** Quatre joueurs (dont deux d'autres clubs), tableau du premier tour saisi par l'admin. */
async function fill(by = admin) {
  const a = (await addNewEntry(by, tid, { firstName: "Lucas", lastName: "Martin", fftRank: "R30" })).playerId;
  const b = (await addNewEntry(by, tid, { firstName: "Thomas", lastName: "Dubois", fftRank: "R30_1", clubName: "AS Mont-Noir" })).playerId;
  const c = (await addNewEntry(by, tid, { firstName: "Chloé", lastName: "Petit", fftRank: "R30_2", clubName: "TC des Flandres" })).playerId;
  const d = (await addNewEntry(by, tid, { firstName: "Denis", lastName: "Roux", fftRank: "R30_3" })).playerId;
  await setFirstRound(by, tid, [
    { position: 0, homePlayerId: a, awayPlayerId: b, startsAt: SF },
    { position: 1, homePlayerId: c, awayPlayerId: d, startsAt: SF },
  ]);
  return [a, b, c, d] as const;
}

async function matches() {
  return db.tournamentMatch.findMany({ where: { tournamentId: tid }, orderBy: [{ round: "asc" }, { position: "asc" }] });
}

describe("juges-arbitres : nomination", () => {
  it("un admin nomme autant de membres simples qu'il veut ; retrait possible", async () => {
    const second = await makeUser("Arbitre2");
    await joinClub(second, clubId);
    await addReferee(admin, tid, referee);
    await addReferee(admin, tid, second);
    expect((await getTournamentPage(admin, tid)).referees.map((r) => r.name).sort()).toEqual(["Arbitre", "Arbitre2"]);
    await removeReferee(admin, tid, second);
    expect((await getTournamentPage(admin, tid)).referees).toHaveLength(1);
    await expect(removeReferee(admin, tid, second)).rejects.toThrow("pas juge-arbitre");
  });

  it("refusé : non-admin, non-membre, admin du club, doublon, joueur du tournoi", async () => {
    await expect(addReferee(member, tid, referee)).rejects.toThrow();
    await expect(addReferee(referee, tid, member)).rejects.toThrow(); // un juge-arbitre ne nomme pas
    await expect(addReferee(admin, tid, outsider)).rejects.toThrow("pas membre");
    await expect(addReferee(admin, tid, admin)).rejects.toThrow("déjà admin");
    await addReferee(admin, tid, referee);
    await expect(addReferee(admin, tid, referee)).rejects.toThrow("déjà juge-arbitre");
    const player = (await addNewEntry(admin, tid, { firstName: "Moi", lastName: "Joueur", fftRank: "R30" })).playerId;
    await db.player.update({ where: { id: player }, data: { userId: member } });
    await expect(addReferee(admin, tid, member)).rejects.toThrow("joue le tournoi");
    await expect(removeReferee(referee, tid, referee)).rejects.toThrow();
  });

  it("la liste des membres à nommer exclut les admins et les juges-arbitres déjà nommés", async () => {
    await addReferee(admin, tid, referee);
    const page = await getTournamentPage(admin, tid);
    expect(page.refereeCandidates.map((c) => c.name)).toEqual(["Membre"]);
    expect((await getTournamentPage(referee, tid)).refereeCandidates).toEqual([]); // seul un admin nomme
  });
});

describe("juges-arbitres : droits", () => {
  it("prépare le tableau, ajoute des joueurs, fixe les heures et les infos de l'affiche ; un simple membre ne le peut pas", async () => {
    await addReferee(admin, tid, referee);
    const [a, b, c, d] = await fill(referee);
    await setFirstRound(referee, tid, [{ position: 0, homePlayerId: b, awayPlayerId: a, startsAt: SF }]);
    await setTournamentInfo(referee, tid, { tableLabel: "ft4sd", venue: "Court central" });
    expect(await db.tournament.findUniqueOrThrow({ where: { id: tid }, select: { tableLabel: true, venue: true } })).toEqual({ tableLabel: "FT4SD", venue: "Court central" });
    await expect(addNewEntry(member, tid, { firstName: "X", lastName: "Y", fftRank: "R30" })).rejects.toThrow();
    await expect(setFirstRound(member, tid, [])).rejects.toThrow("juges-arbitres");
    await expect(setTournamentInfo(member, tid, { tableLabel: "SM", venue: "" })).rejects.toThrow();
    await expect(setTournamentInfo(outsider, tid, { tableLabel: "SM", venue: "" })).rejects.toThrow();
    expect([a, b, c, d]).toHaveLength(4);
  });

  it("voit le brouillon ; ne publie pas, ne supprime pas, n'annule pas", async () => {
    await expect(getTournamentPage(referee, tid)).rejects.toMatchObject({ code: "NOT_FOUND" }); // pas encore nommé
    await addReferee(admin, tid, referee);
    const page = await getTournamentPage(referee, tid);
    expect(page).toMatchObject({ isStaff: true, isAdmin: false });
    await fill();
    await expect(publishTournament(referee, tid, T0)).rejects.toThrow();
    await expect(deleteDraftTournament(referee, tid)).rejects.toThrow();
    await publishTournament(admin, tid, T0);
    await expect(cancelTournament(referee, tid, T0)).rejects.toThrow();
  });

  it("saisit les scores : règle les pronostics et fait avancer le vainqueur ; un simple membre ne le peut pas", async () => {
    await addReferee(admin, tid, referee);
    await fill();
    await publishTournament(admin, tid, T0);
    const [sf1, , fin] = await matches();
    await expect(recordTournamentResult(member, sf1!.id, win("HOME"), AFTER_SF)).rejects.toThrow();
    await recordTournamentResult(referee, sf1!.id, win("HOME", [{ home: 6, away: 4 }, { home: 7, away: 5 }]), AFTER_SF);
    const done = await db.tournamentMatch.findUniqueOrThrow({ where: { id: sf1!.id } });
    expect(done.settledAt).not.toBeNull();
    expect((await db.tournamentMatch.findUniqueOrThrow({ where: { id: fin!.id } })).homePlayerId).toBe(done.homePlayerId);
    await setMatchTime(referee, fin!.id, FINAL, AFTER_SF);
  });

  it("ne pronostique pas le tournoi qu'il arbitre", async () => {
    await addReferee(admin, tid, referee);
    await fill();
    await publishTournament(admin, tid, T0);
    expect((await getTournamentPanel(referee, tid)).blockedReason).toBe("Tu es juge-arbitre de ce tournoi : tu ne peux pas le pronostiquer.");
    expect((await getTournamentPanel(member, tid)).blockedReason).toBeNull();
  });

  it("retiré du club, un juge-arbitre perd ses droits", async () => {
    await addReferee(admin, tid, referee);
    await db.clubMembership.delete({ where: { userId_clubId: { userId: referee, clubId } } });
    await expect(setTournamentInfo(referee, tid, { tableLabel: "SM", venue: "" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("joueurs d'autres clubs", () => {
  it("le club en texte libre est enregistré, et la fiche n'est pas un joueur du club", async () => {
    await fill();
    const ext = await db.player.findMany({ where: { clubId, externalClubName: { not: null } }, select: { externalClubName: true } });
    expect(ext.map((p) => p.externalClubName).sort()).toEqual(["AS Mont-Noir", "TC des Flandres"]);
    const listed = (await listClubPlayers(admin, clubId)).map((p) => `${p.firstName} ${p.lastName}`);
    expect(listed).toContain("Lucas Martin"); // sans club précisé : fiche du club (comme avant)
    expect(listed).not.toContain("Thomas Dubois");
    expect(listed).not.toContain("Chloé Petit");
  });

  it("le choix « joueur du club » du tournoi ne propose pas les joueurs d'autres clubs", async () => {
    await fill();
    await db.tournamentEntry.deleteMany({ where: { tournamentId: tid } });
    const page = await getTournamentPage(admin, tid);
    expect(page.availablePlayers.map((p) => p.name)).toEqual(["Lucas Martin", "Denis Roux"]);
    await addEntry(admin, tid, page.availablePlayers[0]!.id);
  });

  it("nom du club trop long refusé", async () => {
    await expect(addNewEntry(admin, tid, { firstName: "A", lastName: "B", fftRank: "R30", clubName: "x".repeat(61) })).rejects.toThrow("60");
  });
});

describe("infos de l'affiche", () => {
  it("sigle en majuscules, lettres et chiffres seulement, 12 caractères au plus ; vide = non renseigné", async () => {
    await expect(setTournamentInfo(admin, tid, { tableLabel: "SM SD", venue: "" })).rejects.toThrow("Sigle");
    await expect(setTournamentInfo(admin, tid, { tableLabel: "ABCDEFGHIJKLM", venue: "" })).rejects.toThrow("Sigle");
    await expect(setTournamentInfo(admin, tid, { tableLabel: "SM", venue: "v".repeat(81) })).rejects.toThrow("Lieu");
    await setTournamentInfo(admin, tid, { tableLabel: " fT3sm ", venue: "  " });
    expect(await db.tournament.findUniqueOrThrow({ where: { id: tid }, select: { tableLabel: true, venue: true } })).toEqual({ tableLabel: "FT3SM", venue: null });
    await setTournamentInfo(admin, tid, { tableLabel: "", venue: "" });
    expect((await db.tournament.findUniqueOrThrow({ where: { id: tid } })).tableLabel).toBeNull();
  });
});

describe("affiche", () => {
  it("un brouillon n'est lu que du personnel", async () => {
    await expect(getTournamentPoster(null, tid)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getTournamentPoster(member, tid)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await addReferee(admin, tid, referee);
    expect((await getTournamentPoster(referee, tid)).isStaff).toBe(true);
    expect((await getTournamentPoster(admin, tid)).isStaff).toBe(true);
  });

  it("publié : lisible sans compte ; joueurs en « Prénom N. » pour un visiteur, club d'origine, classement, sigle ; les matchs sans joueur ni heure n'y figurent pas", async () => {
    await fill();
    await setTournamentInfo(admin, tid, { tableLabel: "SM", venue: "Complexe des Flandres" });
    await publishTournament(admin, tid, T0);
    const poster = await getTournamentPoster(null, tid);
    expect(poster).toMatchObject({ name: "Tournoi de l'affiche", clubName: "TC Affiche", venue: "Complexe des Flandres", heading: "Matchs du", tableLabel: "SM", isStaff: false });
    expect(poster.rows).toHaveLength(2); // la finale n'a ni joueur ni heure
    expect(poster.rows[0]).toMatchObject({
      table: "SM",
      home: { name: "Lucas M.", club: "TC Affiche", rank: "30", won: false },
      away: { name: "Thomas D.", club: "AS Mont-Noir", rank: "30/1", won: false },
      score: "",
      done: false,
    });
    expect(poster.rows[0]!.time).toMatch(/^\d\d:\d\d$/);
  });

  it("sans lieu saisi, l'affiche prend l'adresse du club, sinon son nom", async () => {
    await fill();
    await publishTournament(admin, tid, T0);
    expect((await getTournamentPoster(null, tid)).venue).toBe("TC Affiche");
    await db.club.update({ where: { id: clubId }, data: { address: "12 rue du Court", city: "Lille" } });
    expect((await getTournamentPoster(null, tid)).venue).toBe("12 rue du Court, Lille");
  });

  it("scores : vainqueur, sets avec des barres, WO ; « Résultats du » seulement quand tous les matchs affichés ont un score", async () => {
    await fill();
    await publishTournament(admin, tid, T0);
    const [sf1, sf2, fin] = await matches();
    await recordTournamentResult(admin, sf1!.id, win("HOME", [{ home: 6, away: 4 }, { home: 7, away: 5 }]), AFTER_SF);
    let poster = await getTournamentPoster(null, tid);
    expect(poster.heading).toBe("Matchs du");
    expect(poster.rows[0]).toMatchObject({ score: "6/4 7/5", done: true, winnerSide: "HOME", home: { won: true }, away: { won: false } });
    await recordTournamentResult(admin, sf2!.id, { outcome: "WALKOVER", winnerSide: "AWAY", sets: [] }, AFTER_SF);
    poster = await getTournamentPoster(null, tid);
    expect(poster.rows[1]).toMatchObject({ score: "WO", away: { name: "Denis R.", won: true } });
    expect((await getTournamentPoster(admin, tid)).rows[1]).toMatchObject({ away: { name: "Denis Roux" } });
    expect(poster.rows).toHaveLength(3); // la finale a maintenant ses deux joueurs
    expect(poster.heading).toBe("Matchs du");
    await setMatchTime(admin, fin!.id, FINAL, AFTER_SF);
    await recordTournamentResult(admin, fin!.id, win("AWAY", [{ home: 3, away: 6 }, { home: 2, away: 6 }]), AFTER_FINAL);
    poster = await getTournamentPoster(null, tid);
    expect(poster.heading).toBe("Résultats du");
    expect(poster.rows[2]).toMatchObject({ score: "3/6 2/6", winnerSide: "AWAY" });
  });

  it("un tournoi annulé n'est lu que du personnel ; un tournoi inconnu est introuvable", async () => {
    await fill();
    await publishTournament(admin, tid, T0);
    await cancelTournament(admin, tid, T0);
    await expect(getTournamentPoster(null, tid)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await getTournamentPoster(admin, tid)).status).toBe("CANCELLED");
    await expect(getTournamentPoster(admin, "inconnu")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
