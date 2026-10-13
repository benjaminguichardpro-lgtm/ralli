import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { makeUser } from "../../tests/db/factories";
import { joinClub } from "./club-directory";
import { createClub } from "./clubs";
import { addMatch, createEncounter, publishEncounter } from "./encounters";
import { HOME_RESULTS, getResultsOptions, listResults } from "./results-feed";
import { type MatchResultInput, confirmScore, disputeScore, proposeScore } from "./scores";
import { addNewPlayerToTeam, createExternalTeam, createTeam } from "./teams";

// Résultats des clubs de l'utilisateur : accueil (5 derniers) et page « Résultats ».

const T0 = new Date("2026-10-01T10:00:00Z");
const day = (n: number) => new Date(Date.UTC(2026, 9, n, 12, 0, 0));
const AFTER = (n: number) => new Date(Date.UTC(2026, 9, n, 20, 0, 0));
const win = (matchId: string, winnerSide: "HOME" | "AWAY"): MatchResultInput => ({ matchId, outcome: "COMPLETED", winnerSide, sets: [] });

let admin: string, cap: string, cap2: string, member: string, outsider: string, clubId: string, teamA: string, teamB: string, ext: string;
let h: string[], x: string[];

beforeEach(async () => {
  [admin, cap, cap2, member, outsider] = (await Promise.all(["Admin", "Cap", "Cap2", "Membre", "Dehors"].map(makeUser))) as [string, string, string, string, string];
  const club = await createClub(admin, "TC Résultats");
  clubId = club.id;
  for (const u of [cap, cap2, member]) await joinClub(u, club.id);
  teamA = (await createTeam(admin, clubId, { name: "Messieurs 1", captainUserId: cap })).id;
  teamB = (await createTeam(admin, clubId, { name: "Dames 1", captainUserId: cap2 })).id;
  ext = (await createExternalTeam(admin, clubId, { name: "TC Voisin 1", externalClubName: "TC Voisin" })).id;
  const mk = async (team: string, f: string, l: string) => (await addNewPlayerToTeam(admin, team, { firstName: f, lastName: l, fftRank: "R30" })).id;
  h = [await mk(teamA, "Léa", "Martin"), await mk(teamA, "Hugo", "Durand"), await mk(teamB, "Zoé", "Petit")];
  x = [await mk(ext, "Paul", "Voisin"), await mk(ext, "Marc", "Lenoir"), await mk(ext, "Yann", "Roux")];
});

/** Une rencontre publiée le `d` octobre, avec deux simples ; `clubIsHome` choisit le côté du club. */
async function encounter(d: number, opts: { team?: "A" | "B"; clubIsHome?: boolean } = {}) {
  const team = opts.team === "B" ? teamB : teamA;
  const captain = opts.team === "B" ? cap2 : cap;
  const players = opts.team === "B" ? [h[2]!, h[2]!] : [h[0]!, h[1]!];
  const clubIsHome = opts.clubIsHome ?? true;
  const id = (await createEncounter(captain, { clubTeamId: team, opponentTeamId: ext, clubTeamIsHome: clubIsHome, startsAt: day(d) }, T0)).id;
  const pair = (mine: string, theirs: string) => (clubIsHome ? { homePlayerId: mine, awayPlayerId: theirs } : { homePlayerId: theirs, awayPlayerId: mine });
  const m1 = await addMatch(captain, id, pair(players[0]!, x[0]!), T0);
  const m2 = opts.team === "B" ? null : await addMatch(captain, id, pair(players[1]!, x[1]!), T0);
  await publishEncounter(captain, id, T0);
  return { id, captain, matches: [m1.id, m2?.id].filter(Boolean) as string[], clubIsHome };
}

/** Le club (côté `clubIsHome`) gagne le premier match, perd le second (ou seulement le premier s'il n'y en a qu'un). */
async function proposed(e: Awaited<ReturnType<typeof encounter>>, d: number, clubWinsFirst = true) {
  const mine = e.clubIsHome ? "HOME" : "AWAY";
  const theirs = e.clubIsHome ? "AWAY" : "HOME";
  const results = e.matches.map((m, i) => win(m, i === 0 ? (clubWinsFirst ? mine : theirs) : theirs));
  await proposeScore(e.captain, e.id, results, AFTER(d));
}
const confirmed = async (e: Awaited<ReturnType<typeof encounter>>, d: number, clubWinsFirst = true) => {
  await proposed(e, d, clubWinsFirst);
  await confirmScore(admin, e.id, AFTER(d));
};

describe("derniers résultats", () => {
  it("score confirmé : points de chaque camp, résultat vu du club, joueur à l'extérieur compris", async () => {
    const home = await encounter(5, { clubIsHome: true });
    await confirmed(home, 5); // 1 – 1
    const away = await encounter(6, { clubIsHome: false });
    await confirmed(away, 6, false); // le club perd le premier match, gagne... voir ci-dessous
    const { items } = await listResults(member);
    expect(items.map((i) => i.id)).toEqual([away.id, home.id]); // le plus récent d'abord
    expect(items[1]).toMatchObject({ home: "TC Résultats · Messieurs 1", away: "TC Voisin 1", homePoints: 1, awayPoints: 1, club: { name: "TC Résultats" } });
    expect(items[1]!.result).toMatchObject({ kind: "DRAW", club: 1, opp: 1 });
    expect(items[1]!.result.provisional).toBeUndefined();
    // Le club joue à l'extérieur : « domicile – extérieur » reste l'ordre d'affichage, le résultat est vu du club.
    expect(items[0]).toMatchObject({ home: "TC Voisin 1", away: "TC Résultats · Messieurs 1" });
    expect(items[0]!.result.club + items[0]!.result.opp).toBe(2);
  });

  it("un score proposé apparaît tout de suite, marqué provisoire, puis devient définitif à la confirmation", async () => {
    const e = await encounter(5);
    await proposed(e, 5);
    expect((await listResults(member)).items[0]!.result).toMatchObject({ provisional: true });
    await confirmScore(admin, e.id, AFTER(5));
    expect((await listResults(member)).items[0]!.result.provisional).toBeUndefined();
  });

  it("sans score à montrer : ni à venir, ni verrouillée, ni contestée, ni annulée, ni brouillon, ni archivée", async () => {
    const open = await encounter(20); // publiée, pas jouée
    const disputed = await encounter(7);
    await proposed(disputed, 7);
    await disputeScore(admin, disputed.id, "erreur", AFTER(7));
    const archived = await encounter(8);
    await confirmed(archived, 8);
    await db.encounter.update({ where: { id: archived.id }, data: { archivedAt: AFTER(9) } });
    const cancelled = await encounter(9);
    await db.encounter.update({ where: { id: cancelled.id }, data: { status: "CANCELLED" } });
    const ok = await encounter(10);
    await confirmed(ok, 10);
    expect(open.id).toBeTruthy();
    expect((await listResults(member)).items.map((i) => i.id)).toEqual([ok.id]);
  });

  it("seuls les clubs dont on est membre : un autre compte ne voit rien", async () => {
    const e = await encounter(5);
    await confirmed(e, 5);
    expect((await listResults(outsider)).items).toEqual([]);
    expect(await getResultsOptions(outsider)).toEqual({ clubs: [] });
    expect((await listResults(outsider, { clubId })).items).toEqual([]);
  });

  it("filtre par équipe", async () => {
    const a = await encounter(5);
    await confirmed(a, 5);
    const b = await encounter(6, { team: "B" });
    await confirmed(b, 6);
    expect((await listResults(member, { teamId: teamA })).items.map((i) => i.id)).toEqual([a.id]);
    expect((await listResults(member, { teamId: teamB })).items.map((i) => i.id)).toEqual([b.id]);
    expect((await listResults(member, { clubId })).items).toHaveLength(2);
  });

  it("limite et « voir plus »", async () => {
    for (let d = 2; d <= 8; d++) await confirmed(await encounter(d), d);
    const home = await listResults(member, { limit: HOME_RESULTS });
    expect(home.items).toHaveLength(HOME_RESULTS);
    expect(home.hasMore).toBe(true);
    const all = await listResults(member, { limit: 20 });
    expect(all.items).toHaveLength(7);
    expect(all.hasMore).toBe(false);
    expect(all.items[0]!.startsAt.getTime()).toBeGreaterThan(all.items[6]!.startsAt.getTime());
  });

  it("clubs et équipes proposés pour filtrer", async () => {
    const options = await getResultsOptions(member);
    expect(options.clubs).toHaveLength(1);
    expect(options.clubs[0]).toMatchObject({ id: clubId, name: "TC Résultats" });
    expect(options.clubs[0]!.teams.map((t) => t.name)).toEqual(["Dames 1", "Messieurs 1"]); // les équipes adverses n'y sont pas
  });
});
