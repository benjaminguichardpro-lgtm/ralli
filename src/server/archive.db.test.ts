import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { makeUser } from "../../tests/db/factories";
import { joinClub } from "./club-directory";
import { createClub } from "./clubs";
import {
  archiveEncounter,
  addMatch,
  cancelEncounter,
  createEncounter,
  listArchivedEncounters,
  listClubEncounters,
  publishEncounter,
  unarchiveEncounter,
} from "./encounters";
import { clubTotals } from "./leaderboard";
import { placePrediction } from "./predictions";
import { confirmScore, disputeScore, proposeScore } from "./scores";
import { addNewPlayerToTeam, createExternalTeam, createTeam } from "./teams";

const CREATED = new Date("2026-10-01T10:00:00Z");
const START = new Date("2026-10-05T14:00:00Z");
const BEFORE = new Date("2026-10-05T12:00:00Z");
const AFTER = new Date("2026-10-05T18:00:00Z");

let admin: string, capA: string, capB: string, member: string, bettor: string, outsider: string;
let clubId: string, teamA: string, teamB: string, extId: string;
let players: { a: string[]; b: string[]; ext: string[] };

beforeEach(async () => {
  [admin, capA, capB, member, bettor, outsider] = (await Promise.all(["Admin", "CapA", "CapB", "Membre", "Parieur", "Dehors"].map(makeUser))) as string[] as [
    string, string, string, string, string, string,
  ];
  const club = await createClub(admin, "TC Archives");
  clubId = club.id;
  for (const u of [capA, capB, member, bettor]) await joinClub(u, club.id);
  teamA = (await createTeam(admin, clubId, { name: "Messieurs 1", captainUserId: capA })).id;
  teamB = (await createTeam(admin, clubId, { name: "Messieurs 2", captainUserId: capB })).id;
  extId = (await createExternalTeam(admin, clubId, { name: "TC Voisin 1", externalClubName: "TC Voisin" })).id;
  const mk = async (team: string, f: string, r: "R30" | "R30_1") => (await addNewPlayerToTeam(admin, team, { firstName: f, lastName: "Nom", fftRank: r })).id;
  players = {
    a: [await mk(teamA, "A1", "R30"), await mk(teamA, "A2", "R30")],
    b: [await mk(teamB, "B1", "R30")],
    ext: [await mk(extId, "E1", "R30_1"), await mk(extId, "E2", "R30_1")],
  };
});

/** Rencontre de Messieurs 1 (capA) avec deux simples, jusqu'au statut demandé. */
async function encounter(upTo: "DRAFT" | "OPEN" | "SCORE_PROPOSED" | "DISPUTED" | "CONFIRMED" | "CANCELLED") {
  const id = (await createEncounter(capA, { clubTeamId: teamA, opponentTeamId: extId, clubTeamIsHome: true, startsAt: START }, CREATED)).id;
  const matchIds = [
    (await addMatch(capA, id, { homePlayerId: players.a[0]!, awayPlayerId: players.ext[0]! }, CREATED)).id,
    (await addMatch(capA, id, { homePlayerId: players.a[1]!, awayPlayerId: players.ext[1]! }, CREATED)).id,
  ];
  if (upTo === "DRAFT") return { id, matchIds };
  await publishEncounter(capA, id, CREATED);
  await placePrediction(bettor, { matchId: matchIds[0]!, side: "HOME", committedAces: 100 }, BEFORE);
  await placePrediction(bettor, { matchId: matchIds[1]!, side: "AWAY", committedAces: 50 }, BEFORE);
  if (upTo === "OPEN") return { id, matchIds };
  if (upTo === "CANCELLED") {
    await cancelEncounter(capA, id, "Pluie", BEFORE);
    return { id, matchIds };
  }
  const results = matchIds.map((matchId) => ({ matchId, outcome: "COMPLETED" as const, winnerSide: "HOME" as const, sets: [] }));
  await proposeScore(capA, id, results, AFTER);
  if (upTo === "SCORE_PROPOSED") return { id, matchIds };
  if (upTo === "DISPUTED") {
    await disputeScore(admin, id, "Erreur de saisie", AFTER);
    return { id, matchIds };
  }
  await confirmScore(admin, id, AFTER);
  return { id, matchIds };
}

const archivedAt = async (id: string) => (await db.encounter.findUniqueOrThrow({ where: { id }, select: { archivedAt: true } })).archivedAt;

describe("archivage des rencontres", () => {
  it("accepte une rencontre terminée ou annulée", async () => {
    const done = await encounter("CONFIRMED");
    await archiveEncounter(capA, done.id);
    expect(await archivedAt(done.id)).not.toBeNull();
    const cancelled = await encounter("CANCELLED");
    await archiveEncounter(admin, cancelled.id);
    expect(await archivedAt(cancelled.id)).not.toBeNull();
  });

  it("refuse brouillon, ouverte, score proposé et score contesté", async () => {
    for (const s of ["DRAFT", "OPEN", "SCORE_PROPOSED", "DISPUTED"] as const) {
      const e = await encounter(s);
      // Le refus doit venir de la règle de l'app (code INVALID_TRANSITION), pas seulement de la contrainte en base.
      await expect(archiveEncounter(admin, e.id), s).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
      expect(await archivedAt(e.id), s).toBeNull();
    }
  });

  it("admin et capitaine de l'équipe : oui ; autre capitaine, membre et inconnu du club : non", async () => {
    const e = await encounter("CONFIRMED");
    await expect(archiveEncounter(capB, e.id)).rejects.toThrow("Réservé au capitaine");
    await expect(archiveEncounter(member, e.id)).rejects.toThrow("Réservé au capitaine");
    await expect(archiveEncounter(outsider, e.id)).rejects.toThrow("Rencontre introuvable");
    expect(await archivedAt(e.id)).toBeNull();
    await archiveEncounter(capA, e.id);
    await unarchiveEncounter(admin, e.id);
    await archiveEncounter(admin, e.id);
  });

  it("une rencontre déjà archivée ne s'archive pas deux fois ; désarchiver la remet dans la liste", async () => {
    const e = await encounter("CONFIRMED");
    await archiveEncounter(admin, e.id);
    await expect(archiveEncounter(admin, e.id)).rejects.toThrow("déjà archivée");
    await unarchiveEncounter(capA, e.id);
    expect(await archivedAt(e.id)).toBeNull();
    await expect(unarchiveEncounter(admin, e.id)).rejects.toThrow("pas archivée");
  });

  it("sort de la liste du club (pour tous) et entre dans les archives, réservées aux admins et capitaines", async () => {
    const keep = await encounter("OPEN");
    const done = await encounter("CONFIRMED");
    await archiveEncounter(admin, done.id);
    for (const viewer of [admin, capA, capB, member, bettor]) {
      const ids = (await listClubEncounters(viewer, clubId, AFTER)).map((i) => i.id);
      expect(ids, "liste du club").toEqual([keep.id]);
    }
    expect((await listArchivedEncounters(admin, clubId, AFTER)).map((i) => i.id)).toEqual([done.id]);
    expect((await listArchivedEncounters(capB, clubId, AFTER)).map((i) => i.id)).toEqual([done.id]);
    expect(await listArchivedEncounters(member, clubId, AFTER)).toEqual([]);
    await expect(listArchivedEncounters(outsider, clubId, AFTER)).rejects.toThrow();
  });

  it("la croix n'est proposée qu'à qui peut archiver, sur une rencontre terminée ou annulée seulement", async () => {
    const done = await encounter("CONFIRMED");
    const open = await encounter("OPEN");
    const flags = async (viewer: string) =>
      Object.fromEntries((await listClubEncounters(viewer, clubId, AFTER)).map((i) => [i.id, i.canArchive]));
    expect(await flags(admin)).toEqual({ [done.id]: true, [open.id]: false });
    expect(await flags(capA)).toEqual({ [done.id]: true, [open.id]: false });
    expect(await flags(capB)).toEqual({ [done.id]: false, [open.id]: false });
    expect(await flags(member)).toEqual({ [done.id]: false, [open.id]: false });
  });

  it("ne change ni les classements ni les soldes, et laisse une trace au journal", async () => {
    const done = await encounter("CONFIRMED");
    const from = new Date("2026-09-01T00:00:00Z");
    const to = new Date("2027-09-01T00:00:00Z");
    const before = await clubTotals(clubId, from, to);
    const ledgerBefore = await db.ledgerEntry.count();
    await archiveEncounter(admin, done.id);
    expect(await clubTotals(clubId, from, to)).toEqual(before);
    expect(await db.ledgerEntry.count()).toBe(ledgerBefore);
    expect(before.length).toBeGreaterThan(0);

    await unarchiveEncounter(admin, done.id);
    const notes = (await db.encounterEvent.findMany({ where: { encounterId: done.id }, orderBy: { createdAt: "asc" } })).map((x) => x.note);
    expect(notes.slice(-2)).toEqual(["Archivée", "Sortie des archives"]);
    const who = await db.encounter.findUniqueOrThrow({ where: { id: done.id }, select: { archivedById: true } });
    expect(who.archivedById).toBeNull();
  });

  it("la base refuse d'archiver une rencontre qui n'est ni terminée ni annulée", async () => {
    const draft = await encounter("DRAFT");
    await expect(db.encounter.update({ where: { id: draft.id }, data: { archivedAt: new Date() } })).rejects.toThrow();
  });
});
