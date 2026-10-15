import { beforeEach, describe, expect, it } from "vitest";
import { buildXlsx } from "../../tests/xlsx";
import { db } from "@/lib/db";
import { normalizeSheet } from "@/lib/players/import";
import { buildPlayersTemplateXlsx } from "@/lib/players/template-xlsx";
import { makeUser } from "../../tests/db/factories";
import { joinClub } from "./club-directory";
import {
  addClubPlayer,
  addClubPlayerToTeam,
  applyImport,
  deleteClubPlayer,
  listClubPlayers,
  parseImportFile,
  previewImport,
  updateClubPlayer,
} from "./club-players";
import { createClub } from "./clubs";
import { addMatch, createEncounter, getEncounterPage, publishEncounter } from "./encounters";
import { addNewPlayerToTeam, createExternalTeam, createTeam, getTeamView } from "./teams";
import { addEntry, createTournament, getTournamentPage } from "./tournaments";

// « Joueurs du club » : liste, fiches, import en lot (CSV et Excel), réservé aux admins ; la date de naissance ne sort jamais vers les autres.

const NOW = new Date("2026-10-14T12:00:00Z");
let admin: string, member: string, cap: string, outsider: string, clubId: string, otherClubId: string, teamId: string, extTeamId: string;

const born = (s: string) => new Date(`${s}T00:00:00Z`);
const csv = (text: string, name = "joueurs.csv") => ({ name, size: Buffer.byteLength(text), bytes: Buffer.from(text, "utf-8") });

beforeEach(async () => {
  [admin, member, cap, outsider] = (await Promise.all(["Admin", "Membre", "Cap", "Dehors"].map(makeUser))) as [string, string, string, string];
  clubId = (await createClub(admin, "TC Joueurs")).id;
  otherClubId = (await createClub(outsider, "TC Autre")).id;
  await joinClub(member, clubId);
  await joinClub(cap, clubId);
  teamId = (await createTeam(admin, clubId, { name: "Messieurs 1", captainUserId: cap })).id;
  extTeamId = (await createExternalTeam(admin, clubId, { name: "TC Voisin 1", externalClubName: "TC Voisin" })).id;
});

describe("droits", () => {
  it("tout est réservé aux admins du club : un membre, un capitaine et un étranger sont refusés", async () => {
    const p = await addClubPlayer(admin, clubId, { firstName: "Léa", lastName: "Martin", fftRank: "R30", birthDate: null });
    for (const who of [member, cap, outsider]) {
      await expect(listClubPlayers(who, clubId)).rejects.toThrow();
      await expect(addClubPlayer(who, clubId, { firstName: "A", lastName: "B", fftRank: "NC", birthDate: null })).rejects.toThrow();
      await expect(updateClubPlayer(who, p.id, { firstName: "Léa", lastName: "Martin", fftRank: "R15", birthDate: null })).rejects.toThrow();
      await expect(deleteClubPlayer(who, p.id)).rejects.toThrow();
      await expect(applyImport(who, clubId, normalizeSheet([["Nom", "Prénom"], ["Dupont", "Camille"]]).rows)).rejects.toThrow();
      await expect(previewImport(who, clubId, normalizeSheet([["Nom", "Prénom"], ["Dupont", "Camille"]]).rows)).rejects.toThrow();
    }
    expect(await db.player.count({ where: { clubId } })).toBe(1);
  });
});

describe("fiches", () => {
  it("ajout avec classement (NC compris) et date de naissance ; l'âge est calculé ; nom et classement contrôlés", async () => {
    await addClubPlayer(admin, clubId, { firstName: "Camille", lastName: "Dupont", fftRank: "NC", birthDate: born("1987-03-14") });
    await addClubPlayer(admin, clubId, { firstName: "Thomas", lastName: "Bernard", fftRank: "R15_4", birthDate: null });
    await expect(addClubPlayer(admin, clubId, { firstName: "123", lastName: "X", fftRank: "NC", birthDate: null })).rejects.toThrow();
    await expect(addClubPlayer(admin, clubId, { firstName: "A", lastName: "B", fftRank: "NOPE" as never, birthDate: null })).rejects.toThrow();
    const list = await listClubPlayers(admin, clubId, NOW);
    expect(list.map((p) => `${p.lastName}:${p.rankLabel}:${p.age}`)).toEqual(["Bernard:15/4:null", "Dupont:NC:39"]);
  });

  it("la liste exclut les joueurs des équipes adverses et des autres clubs ; elle contient ceux d'une équipe du club et ceux sans équipe", async () => {
    await addNewPlayerToTeam(admin, teamId, { firstName: "Hugo", lastName: "Durand", fftRank: "R30" });
    await addNewPlayerToTeam(admin, extTeamId, { firstName: "Paul", lastName: "Voisin", fftRank: "R30" });
    await addClubPlayer(admin, clubId, { firstName: "Sans", lastName: "Equipe", fftRank: "NC", birthDate: null });
    await db.player.create({ data: { clubId: otherClubId, firstName: "Etranger", lastName: "Autre", fftRank: "R30" } });
    expect((await listClubPlayers(admin, clubId)).map((p) => p.lastName)).toEqual(["Durand", "Equipe"]);
  });

  it("modification (classement, date) et suppression : refusée si le joueur a été aligné ou inscrit à un tournoi", async () => {
    const a = await addClubPlayer(admin, clubId, { firstName: "Léa", lastName: "Martin", fftRank: "R30", birthDate: null });
    await updateClubPlayer(admin, a.id, { firstName: "Léa", lastName: "Martin", fftRank: "R15", birthDate: born("1995-11-02") });
    expect(await db.player.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ fftRank: "R15", birthDate: born("1995-11-02") });
    await deleteClubPlayer(admin, a.id);
    expect(await db.player.count({ where: { id: a.id } })).toBe(0);

    const inTournament = await addClubPlayer(admin, clubId, { firstName: "Tom", lastName: "Inscrit", fftRank: "R30", birthDate: null });
    const t = await createTournament(admin, clubId, { name: "Open test", drawSize: 4, startsAt: NOW });
    await addEntry(admin, t.id, inTournament.id);
    await expect(deleteClubPlayer(admin, inTournament.id)).rejects.toMatchObject({ code: "PLAYER_HAS_MATCHES" });

    const lined = (await addNewPlayerToTeam(admin, teamId, { firstName: "Al", lastName: "Aligne", fftRank: "R30" })).id;
    const ext = (await addNewPlayerToTeam(admin, extTeamId, { firstName: "Paul", lastName: "Voisin", fftRank: "R30" })).id;
    const enc = (await createEncounter(cap, { clubTeamId: teamId, opponentTeamId: extTeamId, clubTeamIsHome: true, startsAt: new Date("2026-11-01T12:00:00Z") }, NOW)).id;
    await addMatch(cap, enc, { homePlayerId: lined, awayPlayerId: ext }, NOW);
    await expect(deleteClubPlayer(admin, lined)).rejects.toMatchObject({ code: "PLAYER_HAS_MATCHES" });
    expect((await listClubPlayers(admin, clubId)).find((p) => p.id === lined)!.deletable).toBe(false);
  });

  it("un joueur sans équipe se place dans une équipe du club, pas dans une équipe adverse", async () => {
    const p = await addClubPlayer(admin, clubId, { firstName: "Sans", lastName: "Equipe", fftRank: "R30", birthDate: null });
    await addClubPlayerToTeam(admin, teamId, p.id);
    expect((await listClubPlayers(admin, clubId))[0]!.teams.map((t) => t.name)).toEqual(["Messieurs 1"]);
    const q = await addClubPlayer(admin, clubId, { firstName: "Autre", lastName: "Joueur", fftRank: "R30", birthDate: null });
    await expect(addClubPlayerToTeam(admin, extTeamId, q.id)).rejects.toThrow();
    const team = await getTeamView(admin, teamId);
    expect(team.players.map((x) => x.lastName)).toEqual(["Equipe"]);
  });

  it("la date de naissance ne sort pas : ni page d'équipe, ni rencontre, ni tournoi", async () => {
    const p = await addClubPlayer(admin, clubId, { firstName: "Camille", lastName: "Secret", fftRank: "R30", birthDate: born("1987-03-14") });
    await addClubPlayerToTeam(admin, teamId, p.id);
    const opp = (await addNewPlayerToTeam(admin, extTeamId, { firstName: "Paul", lastName: "Voisin", fftRank: "R30" })).id;
    const enc = (await createEncounter(cap, { clubTeamId: teamId, opponentTeamId: extTeamId, clubTeamIsHome: true, startsAt: new Date("2026-11-01T12:00:00Z") }, NOW)).id;
    await addMatch(cap, enc, { homePlayerId: p.id, awayPlayerId: opp }, NOW);
    await publishEncounter(cap, enc, NOW);
    const t = await createTournament(admin, clubId, { name: "Open secret", drawSize: 4, startsAt: NOW });
    await addEntry(admin, t.id, p.id);
    const seen = [await getTeamView(admin, teamId), await getTeamView(cap, teamId), await getEncounterPage(null, enc, NOW), await getEncounterPage(member, enc, NOW), await getTournamentPage(admin, t.id, NOW)];
    for (const view of seen) {
      const text = JSON.stringify(view);
      expect(text).not.toContain("birth");
      expect(text).not.toContain("1987");
    }
  });
});

describe("lecture des fichiers", () => {
  it("CSV en UTF-8, en Windows-1252 (ancien Excel français), séparateur « , » ; Excel .xlsx ; formats refusés", async () => {
    const utf8 = await parseImportFile(csv("Nom;Prénom;Date de naissance;Classement\r\nDupont;Camille;14/03/1987;30/2\r\n"));
    expect(utf8.fatal).toBeNull();
    expect(utf8.rows[0]).toMatchObject({ lastName: "Dupont", firstName: "Camille", fftRank: "R30_2" });

    const latin1 = Buffer.from("Nom;Prénom;Classement\r\nLéger;Zoé;15/1\r\n", "latin1");
    const l = await parseImportFile({ name: "ancien.csv", size: latin1.length, bytes: latin1 });
    expect(l.rows[0]).toMatchObject({ lastName: "Léger", firstName: "Zoé", fftRank: "R15_1" });

    const comma = await parseImportFile(csv("nom,prenom,classement\nRoux,Manon,5/6\n"));
    expect(comma.rows[0]).toMatchObject({ lastName: "Roux", fftRank: "R5_6" });

    const x = buildXlsx([["Nom", "Prénom", "Date de naissance", "Classement"], ["Girard", "Antoine", "21/07/1979", "NC"], ["Petit", "Chloé", "03/05/2001", "-15"]]);
    const xl = await parseImportFile({ name: "club.xlsx", size: x.length, bytes: Buffer.from(x) });
    expect(xl.fatal).toBeNull();
    expect(xl.rows.map((r) => `${r.lastName}:${r.fftRank}:${r.birthDate?.toISOString().slice(0, 10)}`)).toEqual(["Girard:NC:1979-07-21", "Petit:RM15:2001-05-03"]);

    // Le modèle Excel fourni est lui-même importable : les classements « 30/2 » restent du texte.
    const tpl = buildPlayersTemplateXlsx();
    const t = await parseImportFile({ name: "modele-joueurs-ralli.xlsx", size: tpl.length, bytes: Buffer.from(tpl) });
    expect(t.fatal).toBeNull();
    expect(t.rows.map((r) => `${r.lastName}:${r.fftRank}:${r.birthDate?.toISOString().slice(0, 10)}:${r.errors.length}`)).toEqual(["Dupont:R30_2:1987-03-14:0", "Martin:NC:1995-11-02:0", "Bernard:R15_4:1979-07-21:0"]);

    // Un classement devenu nombre dans le tableur (« 30/2 » → 15) est lu comme 15 mais signalé dans l'aperçu.
    const num = buildXlsx([["Nom", "Prénom", "Classement"], ["Digram", "Clément", 15], ["Texte", "Tom", "15"]]);
    const n = await parseImportFile({ name: "numbers.xlsx", size: num.length, bytes: Buffer.from(num) });
    expect(n.rows[0]).toMatchObject({ fftRank: "R15" });
    expect(n.rows[0]!.notes.join(" ")).toContain("lu comme un nombre");
    expect(n.rows[1]!.notes.join(" ")).not.toContain("nombre"); // le texte « 15 » est un vrai classement

    expect((await parseImportFile({ name: "ancien.xls", size: 5, bytes: Buffer.from("xxxxx") })).fatal).toContain(".xls");
    expect((await parseImportFile({ name: "photo.png", size: 5, bytes: Buffer.from("xxxxx") })).fatal).toContain("Format non pris en charge");
    expect((await parseImportFile({ name: "faux.xlsx", size: 5, bytes: Buffer.from("xxxxx") })).fatal).toContain("n'a pas pu être lu");
    expect((await parseImportFile({ name: "vide.csv", size: 0, bytes: Buffer.alloc(0) })).fatal).toContain("vide");
  });
});

describe("import en lot", () => {
  const rows = (text: string) => normalizeSheet(text.split("\n").map((l) => l.split(";")), NOW).rows;

  it("aperçu sans rien écrire : nouveau, mise à jour, identique, doublon, erreur ; puis l'import applique seulement les lignes valides", async () => {
    const existing = await addClubPlayer(admin, clubId, { firstName: "Camille", lastName: "Dupont", fftRank: "R30_2", birthDate: null });
    await addClubPlayer(admin, clubId, { firstName: "Léa", lastName: "Martin", fftRank: "R30", birthDate: born("1995-11-02") });
    const file = rows(
      [
        "Nom;Prénom;Date de naissance;Classement",
        "Dupont;Camille;14/03/1987;30/2", // même personne, la date est ajoutée
        "Martin;Léa;02/11/1995;15/4", // classement changé
        "Bernard;Thomas;21/07/1979;15/4", // nouveau
        "Bernard;Thomas;21/07/1979;15/4", // doublon du fichier
        "Roux;Manon;;abc", // classement inconnu : erreur
        "martin;LÉA;;15/4", // même personne (accents et casse ignorés, date inconnue) : doublon du fichier
      ].join("\n"),
    );
    const preview = await previewImport(admin, clubId, file);
    expect(preview.summary).toEqual({ create: 1, update: 2, same: 0, duplicate: 2, error: 1 });
    expect(preview.rows.map((r) => r.action)).toEqual(["update", "update", "create", "duplicate", "error", "duplicate"]);
    expect(preview.rows[1]!.changes).toEqual(["Classement : 30 → 15/4"]);
    expect(await db.player.count({ where: { clubId } })).toBe(2); // l'aperçu n'a rien écrit

    expect(await applyImport(admin, clubId, file)).toEqual(preview.summary);
    const all = await listClubPlayers(admin, clubId, NOW);
    expect(all.map((p) => `${p.lastName}:${p.rankLabel}:${p.age}`)).toEqual(["Bernard:15/4:47", "Dupont:30/2:39", "Martin:15/4:30"]);
    expect((await db.player.findUniqueOrThrow({ where: { id: existing.id } })).birthDate).toEqual(born("1987-03-14"));
  });

  it("rejouer le même fichier ne change rien (tout est « identique »)", async () => {
    const file = rows("Nom;Prénom;Classement\nDupont;Camille;30/2\nMartin;Léa;NC");
    await applyImport(admin, clubId, file);
    const again = await applyImport(admin, clubId, file);
    expect(again).toEqual({ create: 0, update: 0, same: 2, duplicate: 0, error: 0 });
    expect(await db.player.count({ where: { clubId } })).toBe(2);
  });

  it("une date de naissance différente = une autre personne (homonyme) ; la date existante n'est jamais écrasée", async () => {
    await addClubPlayer(admin, clubId, { firstName: "Marc", lastName: "Durand", fftRank: "R30", birthDate: born("1980-01-01") });
    const s = await applyImport(admin, clubId, rows("Nom;Prénom;Date de naissance;Classement\nDurand;Marc;02/02/1999;R30".replace("R30", "30")));
    expect(s).toMatchObject({ create: 1, update: 0 });
    const list = await listClubPlayers(admin, clubId, NOW);
    expect(list.map((p) => p.birthDate?.toISOString().slice(0, 10)).sort()).toEqual(["1980-01-01", "1999-02-02"]); // deux homonymes : l'ordre entre eux n'est pas défini
  });

  it("ne touche ni les joueurs des équipes adverses, ni ceux d'un autre club", async () => {
    await addNewPlayerToTeam(admin, extTeamId, { firstName: "Camille", lastName: "Dupont", fftRank: "R15" });
    await db.player.create({ data: { clubId: otherClubId, firstName: "Camille", lastName: "Dupont", fftRank: "R15" } });
    const s = await applyImport(admin, clubId, rows("Nom;Prénom;Classement\nDupont;Camille;NC"));
    expect(s).toMatchObject({ create: 1, update: 0 });
    expect((await db.player.findMany({ where: { lastName: "Dupont" } })).map((p) => p.fftRank).sort()).toEqual(["NC", "R15", "R15"]);
  });

  it("un gros fichier (3 000 joueurs) s'importe en une fois", async () => {
    const letters = (i: number) => String.fromCharCode(97 + (i % 26)) + String.fromCharCode(97 + (Math.floor(i / 26) % 26)) + String.fromCharCode(97 + Math.floor(i / 676)); // des noms faits de lettres, tous différents
    const lines = ["Nom;Prénom;Classement", ...Array.from({ length: 3000 }, (_, i) => `N${letters(i)};P${letters(i)};${i % 2 ? "30/1" : "NC"}`)];
    const s = await applyImport(admin, clubId, rows(lines.join("\n")));
    expect(s.create).toBe(3000);
    expect(await db.player.count({ where: { clubId } })).toBe(3000);
  });
});
