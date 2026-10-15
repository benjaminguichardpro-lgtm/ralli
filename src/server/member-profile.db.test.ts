import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { makeUser } from "../../tests/db/factories";
import { joinClub } from "./club-directory";
import { createClub } from "./clubs";
import { addMatch, createEncounter, publishEncounter } from "./encounters";
import { getMemberProfile, getProfilePublic, setProfilePublic } from "./member-profile";
import { placePrediction } from "./predictions";
import { type MatchResultInput, confirmScore, proposeScore } from "./scores";
import { addNewPlayerToTeam, createExternalTeam, createTeam } from "./teams";

const T0 = new Date("2026-10-10T10:00:00Z");
const BEFORE = new Date("2026-10-12T11:00:00Z");
const NOW = new Date("2026-10-12T15:00:00Z");

const res = (matchId: string, outcome: MatchResultInput["outcome"], winnerSide: "HOME" | "AWAY" | null): MatchResultInput => ({ matchId, outcome, winnerSide, sets: [] });

type Built = { clubId: string; capA: string; capB: string; enc: () => Promise<{ id: string; ms: string[] }> };

/** Un club avec une équipe, une équipe adverse, trois joueurs de chaque côté ; `enc()` publie une rencontre de trois matchs. */
async function buildClub(name: string): Promise<Built> {
  const [admin, capA, capB] = (await Promise.all([`${name}Admin`, `${name}CapA`, `${name}CapB`].map(makeUser))) as [string, string, string];
  const club = await createClub(admin, `TC ${name}`);
  for (const u of [capA, capB]) await joinClub(u, club.id);
  const team = (await createTeam(admin, club.id, { name: `${name} 1`, captainUserId: capA })).id;
  await createTeam(admin, club.id, { name: `${name} 2`, captainUserId: capB });
  const ext = (await createExternalTeam(admin, club.id, { name: `${name} Voisin`, externalClubName: "TC Voisin" })).id;
  const mk = async (t: string, f: string, l: string) => (await addNewPlayerToTeam(admin, t, { firstName: f, lastName: l, fftRank: "R30" })).id;
  const p = [await mk(team, "Léa", "Martin"), await mk(team, "Hugo", "Durand"), await mk(team, "Inès", "Petit")];
  const x = [await mk(ext, "Paul", "Voisin"), await mk(ext, "Marc", "Lenoir"), await mk(ext, "Yann", "Roux")];
  let n = 0;
  const enc = async () => {
    n += 1;
    const id = (await createEncounter(capA, { clubTeamId: team, opponentTeamId: ext, clubTeamIsHome: true, startsAt: new Date(`2026-10-12T${12 + n}:00:00Z`) }, T0)).id;
    const ms = [] as string[];
    for (let i = 0; i < 3; i++) ms.push((await addMatch(capA, id, { homePlayerId: p[i]!, awayPlayerId: x[i]! }, T0)).id);
    await publishEncounter(capA, id, T0);
    return { id, ms };
  };
  return { clubId: club.id, capA, capB, enc };
}

const settle = async (b: Built, enc: string, results: MatchResultInput[]) => {
  await proposeScore(b.capA, enc, results, NOW);
  await confirmScore(b.capB, enc, NOW);
};

let A: Built, B: Built;
let viewer: string, target: string, stranger: string;

beforeEach(async () => {
  A = await buildClub("Alpha");
  B = await buildClub("Beta");
  [viewer, target, stranger] = (await Promise.all(["Viewer", "Target", "Stranger"].map(makeUser))) as [string, string, string];
  await joinClub(viewer, A.clubId);
  await joinClub(target, A.clubId);
  await joinClub(target, B.clubId);
  await joinClub(stranger, B.clubId);
});

const bet = (u: string, matchId: string, side: "HOME" | "AWAY", aces: number) => placePrediction(u, { matchId, side, committedAces: aces }, BEFORE);

describe("profil d'un membre", () => {
  it("seulement entre membres d'un club en commun ; personne inconnue = même réponse", async () => {
    expect(await getMemberProfile(viewer, target)).not.toBeNull();
    expect(await getMemberProfile(stranger, viewer)).toBeNull(); // aucun club en commun
    expect(await getMemberProfile(viewer, "inconnu")).toBeNull();
  });

  it("stats, résultats et licence : seulement les clubs en commun ; jamais un pronostic en cours", async () => {
    const a = await A.enc();
    const a2 = await A.enc();
    const b = await B.enc();
    await bet(target, a.ms[0]!, "HOME", 100); // gagné
    await bet(target, a.ms[1]!, "AWAY", 50); // perdu
    await bet(target, a2.ms[0]!, "HOME", 30); // en cours : jamais montré
    await bet(target, b.ms[0]!, "HOME", 70); // club Beta, pas en commun
    await settle(A, a.id, [res(a.ms[0]!, "COMPLETED", "HOME"), res(a.ms[1]!, "COMPLETED", "HOME"), res(a.ms[2]!, "NOT_PLAYED", null)]);
    await settle(B, b.id, [res(b.ms[0]!, "COMPLETED", "HOME"), res(b.ms[1]!, "NOT_PLAYED", null), res(b.ms[2]!, "NOT_PLAYED", null)]);
    // Compte lié à une fiche joueur du club Alpha.
    const pa = await db.player.findFirstOrThrow({ where: { clubId: A.clubId, firstName: "Léa" } });
    await db.player.update({ where: { id: pa.id }, data: { userId: target } });

    const p = (await getMemberProfile(viewer, target))!;
    expect(p.hidden).toBe(false);
    expect(p.commonClubs.map((c) => c.name)).toEqual(["TC Alpha"]);
    expect(p.stats).toMatchObject({ settled: 2, won: 1, hitRate: 50, committedAces: 150 });
    expect(p.results.map((r) => r.status).sort()).toEqual(["LOST", "WON"]);
    expect(p.results.every((r) => r.committedAces !== 30 && r.committedAces !== 70)).toBe(true);
    expect(p.licences).toEqual([{ clubName: "TC Alpha", rankLabel: expect.any(String), teams: ["Alpha 1"] }]);
    expect(p.ranks.map((r) => r.clubName)).toEqual(["TC Alpha"]);
  });

  it("une fiche dans un club qui n'est pas en commun n'est pas montrée", async () => {
    const pb = await db.player.findFirstOrThrow({ where: { clubId: B.clubId, firstName: "Léa" } });
    await db.player.update({ where: { id: pb.id }, data: { userId: target } });
    expect((await getMemberProfile(viewer, target))!.licences).toEqual([]);
  });

  it("profil masqué : avatar, pseudo et clubs en commun seulement ; réactivable", async () => {
    const a = await A.enc();
    await bet(target, a.ms[0]!, "HOME", 100);
    await settle(A, a.id, [res(a.ms[0]!, "COMPLETED", "HOME"), res(a.ms[1]!, "NOT_PLAYED", null), res(a.ms[2]!, "NOT_PLAYED", null)]);
    expect(await getProfilePublic(target)).toBe(true);
    await setProfilePublic(target, false);
    const hidden = (await getMemberProfile(viewer, target))!;
    expect(hidden).toMatchObject({ hidden: true, licences: [], results: [], ranks: [] });
    expect(hidden.stats.settled).toBe(0);
    expect(hidden.commonClubs).toHaveLength(1);
    await setProfilePublic(target, true);
    expect((await getMemberProfile(viewer, target))!.results).toHaveLength(1);
  });

  it("limite : n'affiche que le nombre demandé et dit s'il y en a d'autres", async () => {
    const a = await A.enc();
    for (const m of a.ms) await bet(target, m, "HOME", 10);
    await settle(A, a.id, a.ms.map((m) => res(m, "COMPLETED", "HOME")));
    const two = (await getMemberProfile(viewer, target, 2))!;
    expect([two.results.length, two.hasMore]).toEqual([2, true]);
    const three = (await getMemberProfile(viewer, target, 3))!;
    expect([three.results.length, three.hasMore]).toEqual([3, false]);
  });

  it("un membre retiré du club n'est plus en commun", async () => {
    await db.clubMembership.delete({ where: { userId_clubId: { userId: viewer, clubId: A.clubId } } });
    expect(await getMemberProfile(viewer, target)).toBeNull();
  });
});
