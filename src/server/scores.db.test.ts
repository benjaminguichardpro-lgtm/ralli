import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { effectiveStatus } from "@/lib/encounters/state";
import { makeUser } from "../../tests/db/factories";
import { joinClub } from "./club-directory";
import { createClub } from "./clubs";
import { addMatch, cancelEncounter, createEncounter, listClubEncounters, publishEncounter, rescheduleEncounter } from "./encounters";
import { getBalance } from "./ledger";
import { placePrediction } from "./predictions";
import { type MatchResultInput, clearLiveResult, confirmScore, disputeScore, getScoreView, proposeScore, recordLiveResult, resolveDispute, withdrawScore } from "./scores";
import { addNewPlayerToTeam, createExternalTeam, createTeam } from "./teams";

const T0 = new Date("2026-10-10T10:00:00Z");
const START = new Date("2026-10-12T12:00:00Z");
const NOW = new Date("2026-10-12T15:00:00Z"); // pronostics fermés : rencontre « LOCKED »
const BEFORE = new Date("2026-10-12T11:00:00Z");

let admin: string, admin2: string, capA: string, capB: string, member: string, outsider: string;
let clubId: string, enc: string, mA: string, mB: string, otherEnc: string, otherMatch: string;

beforeEach(async () => {
  [admin, admin2, capA, capB, member, outsider] = (await Promise.all(["Admin", "Admin2", "CapA", "CapB", "Membre", "Dehors"].map(makeUser))) as [
    string, string, string, string, string, string,
  ];
  const club = await createClub(admin, "TC Ralli");
  clubId = club.id;
  for (const u of [admin2, capA, capB, member]) await joinClub(u, club.id);
  await db.clubMembership.update({ where: { userId_clubId: { userId: admin2, clubId } }, data: { role: "ADMIN" } });
  await createClub(outsider, "AS Ailleurs");
  const m1 = (await createTeam(admin, clubId, { name: "Messieurs 1", captainUserId: capA })).id;
  const m2 = (await createTeam(admin, clubId, { name: "Messieurs 2", captainUserId: capB })).id;
  const ext = (await createExternalTeam(admin, clubId, { name: "TC Voisin 1", externalClubName: "TC Voisin" })).id;
  const p1 = (await addNewPlayerToTeam(admin, m1, { firstName: "Léa", lastName: "Martin", fftRank: "R30" })).id;
  const p2 = (await addNewPlayerToTeam(admin, m1, { firstName: "Hugo", lastName: "Durand", fftRank: "R30_1" })).id;
  const x1 = (await addNewPlayerToTeam(admin, ext, { firstName: "Paul", lastName: "Voisin", fftRank: "R30_1" })).id;
  const x2 = (await addNewPlayerToTeam(admin, ext, { firstName: "Marc", lastName: "Lenoir", fftRank: "R30_2" })).id;
  const q1 = (await addNewPlayerToTeam(admin, m2, { firstName: "Al", lastName: "Un", fftRank: "R30" })).id;
  const mk = async (team: string, a: string, b: string) => {
    const id = (await createEncounter(admin, { clubTeamId: team, opponentTeamId: ext, clubTeamIsHome: true, startsAt: START }, T0)).id;
    const m = (await addMatch(admin, id, { homePlayerId: a, awayPlayerId: b }, T0)).id;
    return { id, m };
  };
  enc = (await createEncounter(capA, { clubTeamId: m1, opponentTeamId: ext, clubTeamIsHome: true, startsAt: START }, T0)).id;
  mA = (await addMatch(capA, enc, { homePlayerId: p1, awayPlayerId: x1 }, T0)).id;
  mB = (await addMatch(capA, enc, { homePlayerId: p2, awayPlayerId: x2 }, T0)).id;
  await publishEncounter(capA, enc, T0);
  const o = await mk(m2, q1, x1);
  otherEnc = o.id;
  otherMatch = o.m;
});

const win = (matchId: string, winnerSide: "HOME" | "AWAY" = "HOME"): MatchResultInput => ({ matchId, outcome: "COMPLETED", winnerSide, sets: [] });
const full = (): MatchResultInput[] => [win(mA, "HOME"), { matchId: mB, outcome: "NOT_PLAYED", winnerSide: null, sets: [] }];
const status = async (id = enc) => {
  const e = await db.encounter.findUniqueOrThrow({ where: { id } });
  return effectiveStatus(e, NOW);
};

describe("proposer", () => {
  it("l'équipe du club : capitaine de la rencontre ou admin ; pas un autre capitaine, ni un membre", async () => {
    await expect(proposeScore(capB, enc, full(), NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(proposeScore(member, enc, full(), NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(proposeScore(outsider, enc, full(), NOW)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await proposeScore(admin, enc, full(), NOW);
    expect(await status()).toBe("SCORE_PROPOSED");
  });

  it("seulement une fois les pronostics fermés", async () => {
    await expect(proposeScore(capA, enc, full(), BEFORE)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(proposeScore(capA, enc, full(), START)).resolves.toBeUndefined();
  });

  it("enregistre les résultats, l'auteur et une trace au journal", async () => {
    await proposeScore(capA, enc, [{ matchId: mA, outcome: "COMPLETED", winnerSide: "AWAY", sets: [{ home: 4, away: 6 }, { home: 3, away: 6 }] }, { matchId: mB, outcome: "WALKOVER", winnerSide: "HOME", sets: [] }], NOW);
    const a = await db.match.findUniqueOrThrow({ where: { id: mA } });
    expect(a).toMatchObject({ outcome: "COMPLETED", winnerSide: "AWAY", sets: [{ home: 4, away: 6 }, { home: 3, away: 6 }] });
    expect(await db.match.findUniqueOrThrow({ where: { id: mB } })).toMatchObject({ outcome: "WALKOVER", winnerSide: "HOME", sets: null });
    expect((await db.encounter.findUniqueOrThrow({ where: { id: enc } })).scoreProposedById).toBe(capA);
    const ev = await db.encounterEvent.findFirstOrThrow({ where: { encounterId: enc, toStatus: "SCORE_PROPOSED" } });
    expect(ev).toMatchObject({ actorId: capA, fromStatus: "OPEN", note: "Score proposé" });
  });

  it("exige tous les matchs, sans doublon ni match d'une autre rencontre, et des scores valides", async () => {
    const bad = (r: MatchResultInput[]) => expect(proposeScore(capA, enc, r, NOW)).rejects.toMatchObject({ code: "INVALID" });
    await bad([win(mA)]);
    await bad([win(mA), win(mA)]);
    await bad([win(mA), win(otherMatch)]);
    await bad([win(mA), { matchId: mB, outcome: "COMPLETED", winnerSide: "HOME", sets: [{ home: 20, away: 0 }, { home: 6, away: 3 }] }]);
    await bad([win(mA), { matchId: mB, outcome: "NOT_PLAYED", winnerSide: "HOME", sets: [] }]);
    expect(await status()).toBe("LOCKED");
    expect((await db.match.findUniqueOrThrow({ where: { id: mA } })).outcome).toBeNull(); // rien d'écrit à moitié
  });

  it("refuse un match retiré dans la saisie, et ignore les matchs retirés dans la couverture", async () => {
    await db.match.update({ where: { id: mB }, data: { voidedAt: NOW } });
    await expect(proposeScore(capA, enc, full(), NOW)).rejects.toMatchObject({ code: "INVALID" });
    await proposeScore(capA, enc, [win(mA)], NOW);
  });

  it("une rencontre déjà proposée ne peut pas l'être deux fois", async () => {
    await proposeScore(capA, enc, full(), NOW);
    await expect(proposeScore(admin, enc, full(), NOW)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });
});

describe("confirmer", () => {
  beforeEach(async () => {
    await proposeScore(capA, enc, full(), NOW);
  });

  it("jamais l'auteur de la proposition", async () => {
    await expect(confirmScore(capA, enc, NOW)).rejects.toMatchObject({ code: "FORBIDDEN", message: expect.stringContaining("une autre personne") });
    expect(await status()).toBe("SCORE_PROPOSED");
  });

  it("refuse un simple membre et un non-membre", async () => {
    await expect(confirmScore(member, enc, NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(confirmScore(outsider, enc, NOW)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("un admin ou le capitaine d'une autre équipe du club peut confirmer", async () => {
    await confirmScore(capB, enc, NOW);
    expect(await status()).toBe("CONFIRMED");
    const ev = await db.encounterEvent.findFirstOrThrow({ where: { encounterId: enc, toStatus: "CONFIRMED" } });
    expect(ev).toMatchObject({ actorId: capB, note: "Score confirmé" });
  });

  it("un admin auteur ne peut pas confirmer lui-même, un autre admin le peut", async () => {
    await withdrawScore(capA, enc, NOW);
    await proposeScore(admin, enc, full(), NOW);
    await expect(confirmScore(admin, enc, NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await confirmScore(admin2, enc, NOW);
    expect(await status()).toBe("CONFIRMED");
  });

  it("définitif : ni seconde confirmation, ni contestation, ni retrait, ni annulation", async () => {
    await confirmScore(capB, enc, NOW);
    await expect(confirmScore(admin, enc, NOW)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(disputeScore(admin, enc, "non", NOW)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(withdrawScore(capA, enc, NOW)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(cancelEncounter(admin, enc, "x", NOW)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(proposeScore(admin, enc, full(), NOW)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });

  it("deux confirmations simultanées : une seule passe", async () => {
    const r = await Promise.allSettled([confirmScore(capB, enc, NOW), confirmScore(admin, enc, NOW)]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await db.encounterEvent.count({ where: { encounterId: enc, toStatus: "CONFIRMED" } })).toBe(1);
  });

  it("la confirmation règle les pronostics dans la même opération", async () => {
    await withdrawScore(capA, enc, NOW);
    await placePrediction(member, { matchId: mA, side: "HOME", committedAces: 100 }, BEFORE);
    await proposeScore(capA, enc, full(), NOW);
    expect((await db.prediction.findFirstOrThrow({ where: { userId: member } })).status).toBe("PENDING"); // pas avant la confirmation
    await confirmScore(capB, enc, NOW);
    expect((await db.prediction.findFirstOrThrow({ where: { userId: member } })).status).toBe("WON");
    expect(await getBalance(member)).toBeGreaterThan(1000);
  });

});

describe("contester et trancher", () => {
  beforeEach(async () => {
    await proposeScore(capA, enc, full(), NOW);
  });

  it("motif obligatoire, pas par l'auteur, pas par un simple membre", async () => {
    await expect(disputeScore(capB, enc, "   ", NOW)).rejects.toMatchObject({ code: "INVALID" });
    await expect(disputeScore(capA, enc, "faux", NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(disputeScore(member, enc, "faux", NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(disputeScore(outsider, enc, "faux", NOW)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await status()).toBe("SCORE_PROPOSED");
  });

  it("la contestation passe en litige et garde le motif au journal", async () => {
    await disputeScore(capB, enc, "  Paul a gagné  ", NOW);
    expect(await status()).toBe("DISPUTED");
    const ev = await db.encounterEvent.findFirstOrThrow({ where: { encounterId: enc, toStatus: "DISPUTED" } });
    expect(ev).toMatchObject({ actorId: capB, note: "Paul a gagné" });
    await expect(confirmScore(admin, enc, NOW)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(withdrawScore(capA, enc, NOW)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });

  it("seul un admin tranche, avec un score complet qui remplace la proposition", async () => {
    await disputeScore(capB, enc, "faux", NOW);
    await expect(resolveDispute(capA, enc, full(), NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(resolveDispute(capB, enc, full(), NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(resolveDispute(member, enc, full(), NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(resolveDispute(outsider, enc, full(), NOW)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(resolveDispute(admin, enc, [win(mA)], NOW)).rejects.toMatchObject({ code: "INVALID" });
    expect(await status()).toBe("DISPUTED");
    await resolveDispute(admin, enc, [win(mA, "AWAY"), win(mB, "HOME")], NOW);
    expect(await status()).toBe("CONFIRMED");
    expect(await db.match.findUniqueOrThrow({ where: { id: mA } })).toMatchObject({ outcome: "COMPLETED", winnerSide: "AWAY" });
    expect(await db.match.findUniqueOrThrow({ where: { id: mB } })).toMatchObject({ outcome: "COMPLETED", winnerSide: "HOME" });
    const ev = await db.encounterEvent.findFirstOrThrow({ where: { encounterId: enc, toStatus: "CONFIRMED" } });
    expect(ev).toMatchObject({ actorId: admin, note: "Litige tranché" });
  });

  it("un admin qui a proposé peut trancher", async () => {
    await withdrawScore(capA, enc, NOW);
    await proposeScore(admin, enc, full(), NOW);
    await disputeScore(capB, enc, "faux", NOW);
    await resolveDispute(admin, enc, full(), NOW);
    expect(await status()).toBe("CONFIRMED");
  });

  it("on ne tranche que depuis un litige", async () => {
    await expect(resolveDispute(admin, enc, full(), NOW)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });
});

describe("retirer sa proposition", () => {
  it("seul l'auteur, avant toute réaction ; les résultats sont effacés et on peut reproposer", async () => {
    await proposeScore(capA, enc, full(), NOW);
    await expect(withdrawScore(admin, enc, NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(withdrawScore(capB, enc, NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(withdrawScore(outsider, enc, NOW)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await withdrawScore(capA, enc, NOW);
    expect(await status()).toBe("LOCKED");
    expect((await db.encounter.findUniqueOrThrow({ where: { id: enc } })).scoreProposedById).toBeNull();
    expect(await db.match.findUniqueOrThrow({ where: { id: mA } })).toMatchObject({ outcome: null, winnerSide: null, sets: null });
    await proposeScore(capA, enc, [win(mA, "AWAY"), win(mB, "AWAY")], NOW);
    expect(await status()).toBe("SCORE_PROPOSED");
  });

  it("sans proposition en cours, rien à retirer", async () => {
    await expect(withdrawScore(capA, enc, NOW)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });
});

describe("lecture (getScoreView)", () => {
  it("avant confirmation : le score est visible de tous, marqué provisoire ; journal et actions restent réservés aux admins et capitaines", async () => {
    await proposeScore(capA, enc, full(), NOW);
    for (const v of [null, member, outsider]) {
      const s = await getScoreView(v, enc, NOW);
      expect(s.resultsVisible).toBe(true);
      expect(s.provisional).toBe(true);
      expect(s.tally).not.toBeNull();
      expect(s.matches[0]!.result).toMatchObject({ winnerName: "Léa Martin" });
      expect(s.journal).toEqual([]);
      expect(s.proposedBy).toBeNull();
      expect(s.actions).toEqual({ canRecordLive: false, canPropose: false, canWithdraw: false, canConfirm: false, canDispute: false, canResolve: false });
    }
    const author = await getScoreView(capA, enc, NOW);
    expect(author.matches[0]!.result).toMatchObject({ outcomeLabel: "Joué jusqu'au bout", winnerName: "Léa Martin" });
    expect(author.matches[1]!.result).toMatchObject({ outcomeLabel: "Non joué", winnerName: null });
    expect(author.actions).toMatchObject({ canWithdraw: true, canConfirm: false, canDispute: false });
    expect(author.proposedBy).toBe("CapA");
    expect(author.journal.map((j) => j.text)).toContain("Score proposé");
    const other = await getScoreView(capB, enc, NOW);
    expect(other.actions).toMatchObject({ canWithdraw: false, canConfirm: true, canDispute: true, canResolve: false });
    expect((await getScoreView(member, enc, NOW)).staff).toBe(false);
  });

  it("proposer : seulement l'équipe de la rencontre, et seulement en LOCKED", async () => {
    expect((await getScoreView(capA, enc, NOW)).actions.canPropose).toBe(true);
    expect((await getScoreView(admin, enc, NOW)).actions.canPropose).toBe(true);
    expect((await getScoreView(capB, enc, NOW)).actions.canPropose).toBe(false);
    expect((await getScoreView(member, enc, NOW)).actions.canPropose).toBe(false);
    expect((await getScoreView(capA, enc, BEFORE)).actions.canPropose).toBe(false);
  });

  it("un score contesté n'est plus montré qu'aux admins et capitaines (plus de score provisoire)", async () => {
    await proposeScore(capA, enc, full(), NOW);
    await disputeScore(capB, enc, "faux", NOW);
    for (const v of [null, member, outsider]) {
      const s = await getScoreView(v, enc, NOW);
      expect(s.resultsVisible).toBe(false);
      expect(s.provisional).toBe(false);
      expect(s.tally).toBeNull();
    }
    expect((await getScoreView(capA, enc, NOW)).resultsVisible).toBe(true);
  });

  it("litige : motif et bouton de décision réservés aux admins", async () => {
    await proposeScore(capA, enc, full(), NOW);
    await disputeScore(capB, enc, "faux", NOW);
    expect((await getScoreView(admin, enc, NOW)).actions.canResolve).toBe(true);
    expect((await getScoreView(capA, enc, NOW)).actions.canResolve).toBe(false);
    expect((await getScoreView(capA, enc, NOW)).disputeReason).toBe("faux");
    expect((await getScoreView(member, enc, NOW)).disputeReason).toBeNull();
  });

  it("après confirmation : scores et décompte publics, journal toujours réservé", async () => {
    await proposeScore(capA, enc, [win(mA, "HOME"), win(mB, "AWAY")], NOW);
    await confirmScore(capB, enc, NOW);
    const pub = await getScoreView(null, enc, NOW);
    expect(pub.resultsVisible).toBe(true);
    expect(pub.provisional).toBe(false);
    expect(pub.tally).toEqual({ home: 1, away: 1 });
    expect(pub.matches[0]!.result?.winnerName).toBe("Léa Martin");
    expect(pub.journal).toEqual([]);
    expect((await getScoreView(admin, enc, NOW)).journal.length).toBeGreaterThan(3);
    expect(Object.values((await getScoreView(admin, enc, NOW)).actions).every((v) => v === false)).toBe(true);
  });

  it("sets affichés tels que saisis", async () => {
    await proposeScore(capA, enc, [{ matchId: mA, outcome: "COMPLETED", winnerSide: "HOME", sets: [{ home: 6, away: 4 }, { home: 3, away: 6 }, { home: 10, away: 8, superTiebreak: true }] }, win(mB)], NOW);
    expect((await getScoreView(capA, enc, NOW)).matches[0]!.result?.sets).toBe("6-4 3-6 10-8");
  });
});

describe("indépendance des rencontres", () => {
  it("proposer sur une rencontre ne touche pas une autre", async () => {
    await proposeScore(capA, enc, full(), NOW);
    expect((await db.encounter.findUniqueOrThrow({ where: { id: otherEnc } })).status).toBe("DRAFT");
    expect((await db.match.findUniqueOrThrow({ where: { id: otherMatch } })).outcome).toBeNull();
  });
});

describe("saisie en direct", () => {
  const live = (matchId: string, winnerSide: "HOME" | "AWAY" = "HOME") => ({ outcome: "COMPLETED" as const, winnerSide, sets: [] });

  it("capitaine de l'équipe ou admin seulement ; pas un autre capitaine, un membre, ni un non-membre", async () => {
    await expect(recordLiveResult(capB, mA, live(mA), NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(recordLiveResult(member, mA, live(mA), NOW)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(recordLiveResult(outsider, mA, live(mA), NOW)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(recordLiveResult(capA, otherMatch, live(otherMatch), NOW)).rejects.toMatchObject({ code: "FORBIDDEN" }); // match d'une autre équipe
    await recordLiveResult(capA, mA, live(mA), NOW);
    await recordLiveResult(admin, mB, live(mB, "AWAY"), NOW);
  });

  it("seulement une fois la rencontre commencée et tant que le score final n'est pas proposé", async () => {
    await expect(recordLiveResult(capA, mA, live(mA), BEFORE)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await recordLiveResult(capA, mA, live(mA), NOW);
    await proposeScore(capA, enc, [win(mA), win(mB)], NOW);
    await expect(recordLiveResult(capA, mA, live(mA, "AWAY"), NOW)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(clearLiveResult(capA, mA, NOW)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });

  it("le score est visible de tous, en direct, et il évolue match par match", async () => {
    expect(await getScoreView(null, enc, NOW)).toMatchObject({ live: false, tally: null });
    await recordLiveResult(capA, mA, live(mA), NOW);
    let v = await getScoreView(null, enc, NOW);
    expect(v).toMatchObject({ live: true, provisional: false, resultsVisible: true, tally: { home: 1, away: 0 } });
    expect(v.matches.find((m) => m.id === mA)?.result?.winnerSide).toBe("HOME");
    expect(v.matches.find((m) => m.id === mB)?.result).toBeNull();
    expect(v.actions.canRecordLive).toBe(false); // un visiteur ne saisit pas
    await recordLiveResult(capA, mB, live(mB, "AWAY"), NOW);
    v = await getScoreView(member, enc, NOW);
    expect(v.tally).toEqual({ home: 1, away: 1 });
    expect((await getScoreView(capA, enc, NOW)).actions).toMatchObject({ canRecordLive: true, canPropose: true });
    expect((await getScoreView(capB, enc, NOW)).actions.canRecordLive).toBe(false);
  });

  it("aucun pronostic n'est réglé en direct : seule la confirmation du score final règle", async () => {
    await placePrediction(member, { matchId: mA, side: "HOME", committedAces: 100 }, BEFORE);
    const balance = await getBalance(member);
    await recordLiveResult(capA, mA, live(mA), NOW);
    expect((await db.prediction.findFirstOrThrow({ where: { userId: member } })).status).toBe("PENDING");
    expect(await getBalance(member)).toBe(balance);
    await proposeScore(capA, enc, [win(mA), { matchId: mB, outcome: "NOT_PLAYED", winnerSide: null, sets: [] }], NOW);
    expect((await db.prediction.findFirstOrThrow({ where: { userId: member } })).status).toBe("PENDING");
    await confirmScore(capB, enc, NOW);
    expect((await db.prediction.findFirstOrThrow({ where: { userId: member } })).status).toBe("WON");
  });

  it("se corrige (on saisit à nouveau) et s'efface ; une trace reste au journal", async () => {
    await recordLiveResult(capA, mA, live(mA, "HOME"), NOW);
    await recordLiveResult(capA, mA, live(mA, "AWAY"), NOW);
    expect(await db.match.findUniqueOrThrow({ where: { id: mA } })).toMatchObject({ outcome: "COMPLETED", winnerSide: "AWAY" });
    expect((await getScoreView(null, enc, NOW)).tally).toEqual({ home: 0, away: 1 });
    await clearLiveResult(capA, mA, NOW);
    expect(await db.match.findUniqueOrThrow({ where: { id: mA } })).toMatchObject({ outcome: null, winnerSide: null });
    expect((await getScoreView(null, enc, NOW)).live).toBe(false);
    expect(await db.encounterEvent.count({ where: { encounterId: enc, note: { in: ["Match saisi en direct", "Résultat de match effacé"] } } })).toBe(3);
  });

  it("rencontre reportée après la fermeture des pronostics : ni saisie ni proposition avant la nouvelle heure de début", async () => {
    const later = new Date(NOW.getTime() + 3_600_000);
    await db.encounter.update({ where: { id: enc }, data: { startsAt: later } }); // pronostics restés fermés (predictionsCloseAt inchangé)
    expect(await status()).toBe("LOCKED");
    await expect(recordLiveResult(capA, mA, live(mA), NOW)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(proposeScore(capA, enc, full(), NOW)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    const v = await getScoreView(capA, enc, NOW);
    expect(v.actions).toMatchObject({ canRecordLive: false, canPropose: false });
    await recordLiveResult(capA, mA, live(mA), later); // à l'heure de début : possible
  });

  it("un report est refusé tant que des résultats sont saisis", async () => {
    await recordLiveResult(capA, mA, live(mA), NOW);
    await expect(rescheduleEncounter(capA, enc, new Date(NOW.getTime() + 86_400_000), NOW)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await clearLiveResult(capA, mA, NOW);
    await expect(rescheduleEncounter(capA, enc, new Date(NOW.getTime() + 86_400_000), NOW)).resolves.toBeUndefined();
  });

  it("refuse un résultat invalide (vainqueur manquant) et ne touche pas le match", async () => {
    await expect(recordLiveResult(capA, mA, { outcome: "COMPLETED", winnerSide: null, sets: [] }, NOW)).rejects.toMatchObject({ code: "INVALID" });
    expect((await db.match.findUniqueOrThrow({ where: { id: mA } })).outcome).toBeNull();
  });

  it("les résultats saisis en direct servent de départ au score final, et la liste montre « En direct »", async () => {
    await recordLiveResult(capA, mA, live(mA), NOW);
    const list = await listClubEncounters(admin, clubId, NOW);
    expect(list.find((e) => e.id === enc)?.result).toMatchObject({ live: true, club: 1, opp: 0 });
    expect(list.find((e) => e.id === otherEnc)?.result).toBeNull(); // aucune saisie : pas de score
    await proposeScore(capA, enc, [win(mA), win(mB)], NOW);
    expect((await listClubEncounters(admin, clubId, NOW)).find((e) => e.id === enc)?.result).toMatchObject({ provisional: true });
  });
});
