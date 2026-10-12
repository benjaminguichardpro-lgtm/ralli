import { beforeEach, describe, expect, it } from "vitest";
import { makeUser } from "../../tests/db/factories";
import { joinClub } from "./club-directory";
import { createClub } from "./clubs";
import { addMatch, archiveEncounter, cancelEncounter, createEncounter, listArchivedEncounters, listClubEncounters, publishEncounter } from "./encounters";
import { type MatchResultInput, confirmScore, proposeScore } from "./scores";
import { addNewPlayerToTeam, createExternalTeam, createTeam } from "./teams";

const T0 = new Date("2026-10-10T10:00:00Z");
let startMs = new Date("2026-10-12T12:00:00Z").getTime();
const AFTER = new Date("2026-10-20T18:00:00Z");

let admin: string, cap: string, member: string;
let clubId: string, teamA: string, ext: string;
let h: string[], x: string[];

beforeEach(async () => {
  [admin, cap, member] = (await Promise.all(["Admin", "Cap", "Membre"].map(makeUser))) as string[] as [string, string, string];
  const club = await createClub(admin, "TC Résultats");
  clubId = club.id;
  for (const u of [cap, member]) await joinClub(u, club.id);
  teamA = (await createTeam(admin, clubId, { name: "Messieurs 1", captainUserId: cap })).id;
  ext = (await createExternalTeam(admin, clubId, { name: "TC Voisin 1", externalClubName: "TC Voisin" })).id;
  const mk = async (team: string, f: string, l: string) => (await addNewPlayerToTeam(admin, team, { firstName: f, lastName: l, fftRank: "R30" })).id;
  h = [await mk(teamA, "A", "Un"), await mk(teamA, "B", "Deux"), await mk(teamA, "C", "Trois"), await mk(teamA, "D", "Quatre")];
  x = [await mk(ext, "E", "Cinq"), await mk(ext, "F", "Six"), await mk(ext, "G", "Sept"), await mk(ext, "H", "Huit")];
});

type Win = "HOME" | "AWAY" | null;
const won = (matchId: string, winnerSide: Win): MatchResultInput => ({
  matchId,
  outcome: winnerSide ? "COMPLETED" : "NOT_PLAYED",
  winnerSide,
  sets: [],
});

/** Rencontre terminée : deux simples et un double de 2 points, avec le vainqueur de chacun. */
async function finished(opts: { clubIsHome: boolean; singles: [Win, Win]; double: Win }) {
  startMs += 24 * 3_600_000;
  const id = (await createEncounter(cap, { clubTeamId: teamA, opponentTeamId: ext, clubTeamIsHome: opts.clubIsHome, startsAt: new Date(startMs) }, T0)).id;
  const pair = (a: string, b: string) => (opts.clubIsHome ? { homePlayerId: a, awayPlayerId: b } : { homePlayerId: b, awayPlayerId: a });
  const s1 = await addMatch(cap, id, pair(h[0]!, x[0]!), T0);
  const s2 = await addMatch(cap, id, pair(h[1]!, x[1]!), T0);
  const d = await addMatch(
    cap,
    id,
    opts.clubIsHome
      ? { homePlayerId: h[0]!, homePlayer2Id: h[1]!, awayPlayerId: x[0]!, awayPlayer2Id: x[1]!, points: 2 }
      : { homePlayerId: x[0]!, homePlayer2Id: x[1]!, awayPlayerId: h[0]!, awayPlayer2Id: h[1]!, points: 2 },
    T0,
  );
  await publishEncounter(cap, id, T0);
  const after = new Date(startMs + 6 * 3_600_000);
  await proposeScore(cap, id, [won(s1.id, opts.singles[0]), won(s2.id, opts.singles[1]), won(d.id, opts.double)], after);
  await confirmScore(admin, id, after);
  return id;
}

const resultOf = async (id: string, viewer = member) => (await listClubEncounters(viewer, clubId, AFTER)).find((e) => e.id === id)!.result;

describe("résultat d'une rencontre pour le club", () => {
  it("à domicile : le double de 2 points l'emporte sur un simple gagné → défaite 1 – 2", async () => {
    const id = await finished({ clubIsHome: true, singles: ["HOME", null], double: "AWAY" });
    expect(await resultOf(id)).toEqual({ kind: "LOSS", club: 1, opp: 2 });
  });

  it("à l'extérieur : le club est l'extérieur, ses points d'abord → victoire 3 – 0", async () => {
    const id = await finished({ clubIsHome: false, singles: ["AWAY", null], double: "AWAY" });
    expect(await resultOf(id)).toEqual({ kind: "WIN", club: 3, opp: 0 });
  });

  it("à l'extérieur, le côté « domicile » est l'adversaire : une victoire de l'adversaire est une défaite du club", async () => {
    const id = await finished({ clubIsHome: false, singles: ["HOME", "HOME"], double: null });
    expect(await resultOf(id)).toEqual({ kind: "LOSS", club: 0, opp: 2 });
  });

  it("égalité de points : nul", async () => {
    const id = await finished({ clubIsHome: true, singles: ["HOME", "AWAY"], double: null });
    expect(await resultOf(id)).toEqual({ kind: "DRAW", club: 1, opp: 1 });
    const two = await finished({ clubIsHome: true, singles: ["HOME", null], double: "AWAY" }); // 1 – 2, pas un nul
    expect((await resultOf(two))!.kind).toBe("LOSS");
  });

  it("le même résultat pour tous les membres (c'est celui du club, pas celui du lecteur)", async () => {
    const id = await finished({ clubIsHome: true, singles: ["HOME", "HOME"], double: "HOME" });
    for (const viewer of [admin, cap, member]) expect(await resultOf(id, viewer)).toEqual({ kind: "WIN", club: 4, opp: 0 });
  });

  it("aucun résultat tant que la rencontre n'est pas terminée (ouverte, annulée)", async () => {
    startMs += 24 * 3_600_000;
    const open = (await createEncounter(cap, { clubTeamId: teamA, opponentTeamId: ext, clubTeamIsHome: true, startsAt: new Date(startMs) }, T0)).id;
    await addMatch(cap, open, { homePlayerId: h[0]!, awayPlayerId: x[0]! }, T0);
    await publishEncounter(cap, open, T0);
    startMs += 24 * 3_600_000;
    const cancelled = (await createEncounter(cap, { clubTeamId: teamA, opponentTeamId: ext, clubTeamIsHome: true, startsAt: new Date(startMs) }, T0)).id;
    await addMatch(cap, cancelled, { homePlayerId: h[0]!, awayPlayerId: x[0]! }, T0);
    await publishEncounter(cap, cancelled, T0);
    await cancelEncounter(cap, cancelled, "Pluie", T0);
    expect(await resultOf(open)).toBeNull();
    expect(await resultOf(cancelled)).toBeNull();
  });

  it("les archives portent aussi le résultat", async () => {
    const id = await finished({ clubIsHome: true, singles: ["HOME", "HOME"], double: "AWAY" });
    await archiveEncounter(admin, id);
    // Deux simples gagnés par le club (2 points) contre le double de 2 points de l'adversaire : nul 2 – 2.
    expect((await listArchivedEncounters(admin, clubId, AFTER)).find((e) => e.id === id)!.result).toEqual({ kind: "DRAW", club: 2, opp: 2 });
  });
});
