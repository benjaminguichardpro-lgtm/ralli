import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { computeOdds } from "@/lib/odds/model";
import { makeUser } from "../../tests/db/factories";
import { joinClub } from "./club-directory";
import { createClub } from "./clubs";
import {
  addMatch,
  cancelEncounter,
  createEncounter,
  deleteDraft,
  getEncounterPage,
  listClubEncounters,
  publishEncounter,
  removeMatch,
  replaceMatch,
  rescheduleEncounter,
} from "./encounters";
import { getBalance } from "./ledger";
import { refundPendingPredictions } from "./refunds";
import { addNewPlayerToTeam, createExternalTeam, createTeam } from "./teams";

// Horloge fixe : toutes les fonctions reçoivent `now` explicitement.
const T0 = new Date("2026-10-10T10:00:00Z");
const START = new Date("2026-10-12T12:00:00Z");
const after = (d: Date, minutes: number) => new Date(d.getTime() + minutes * 60_000);

let admin: string, capA: string, capB: string, member: string, outsider: string, punter: string;
let clubId: string, m1: string, m2: string, ext: string;
let p1: string, p2: string, p3: string, x1: string, x2: string, x3: string;

beforeEach(async () => {
  [admin, capA, capB, member, outsider, punter] = (await Promise.all(
    ["Admin", "CapA", "CapB", "Membre", "Dehors", "Supporter"].map(makeUser),
  )) as [string, string, string, string, string, string];
  const club = await createClub(admin, "TC Ralli");
  clubId = club.id;
  for (const u of [capA, capB, member, punter]) await joinClub(u, club.id);
  await createClub(outsider, "AS Ailleurs");
  m1 = (await createTeam(admin, clubId, { name: "Messieurs 1", captainUserId: capA })).id;
  m2 = (await createTeam(admin, clubId, { name: "Messieurs 2", captainUserId: capB })).id;
  ext = (await createExternalTeam(admin, clubId, { name: "TC Voisin 1", externalClubName: "TC Voisin" })).id;
  p1 = (await addNewPlayerToTeam(admin, m1, { firstName: "Léa", lastName: "Martin", fftRank: "R30" })).id;
  p2 = (await addNewPlayerToTeam(admin, m1, { firstName: "Hugo", lastName: "Durand", fftRank: "R30_1" })).id;
  p3 = (await addNewPlayerToTeam(admin, m1, { firstName: "Inès", lastName: "Petit", fftRank: "R15_5" })).id;
  x1 = (await addNewPlayerToTeam(admin, ext, { firstName: "Paul", lastName: "Voisin", fftRank: "R30_1" })).id;
  x2 = (await addNewPlayerToTeam(admin, ext, { firstName: "Marc", lastName: "Lenoir", fftRank: "R30_2" })).id;
  x3 = (await addNewPlayerToTeam(admin, ext, { firstName: "Yann", lastName: "Roux", fftRank: "NC" })).id;
});

const create = (actor = capA, patch: Partial<Parameters<typeof createEncounter>[1]> = {}) =>
  createEncounter(actor, { clubTeamId: m1, opponentTeamId: ext, clubTeamIsHome: true, startsAt: START, ...patch }, T0);

/** Pronostic inséré directement (l'écran de pronostic arrive à la tranche 6). */
async function predict(userId: string, matchId: string, committedAces: number) {
  const pr = await db.prediction.create({ data: { userId, matchId, pickedSide: "HOME", committedAces, oddsX100: 150 } });
  await db.ledgerEntry.create({
    data: { userId, type: "PREDICTION_COMMIT", amount: -committedAces, predictionId: pr.id, idempotencyKey: `commit:${pr.id}` },
  });
  return pr.id;
}

describe("création (R1, R2, R3)", () => {
  it("capitaine pour son équipe, admin pour toute équipe ; refus pour les autres", async () => {
    await expect(create(capA)).resolves.toHaveProperty("id");
    await expect(create(admin, { clubTeamId: m2 })).resolves.toHaveProperty("id");
    await expect(create(capB)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(create(member)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(create(outsider)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("l'adversaire doit être une équipe adverse du club", async () => {
    await expect(create(admin, { opponentTeamId: m2 })).rejects.toMatchObject({ code: "INVALID" });
    const other = await db.club.findFirstOrThrow({ where: { name: "AS Ailleurs" } });
    const foreignExt = await createExternalTeam(outsider, other.id, { name: "X", externalClubName: "X" });
    await expect(create(admin, { opponentTeamId: foreignExt.id })).rejects.toMatchObject({ code: "INVALID" });
  });

  it("l'heure de début doit être dans le futur", async () => {
    await expect(create(capA, { startsAt: after(T0, -1) })).rejects.toMatchObject({ code: "INVALID" });
  });

  it("domicile ou extérieur, au choix du créateur ; invariant du club organisateur", async () => {
    const home = await create(capA, { clubTeamIsHome: true });
    const away = await create(capA, { clubTeamIsHome: false });
    const h = await db.encounter.findUniqueOrThrow({ where: { id: home.id }, include: { homeTeam: true, awayTeam: true } });
    const a = await db.encounter.findUniqueOrThrow({ where: { id: away.id }, include: { homeTeam: true, awayTeam: true } });
    expect([h.homeTeamId, h.awayTeamId]).toEqual([m1, ext]);
    expect([a.homeTeamId, a.awayTeamId]).toEqual([ext, m1]);
    expect(h.status).toBe("DRAFT");
    expect(h.predictionsCloseAt).toEqual(START);
    // Invariant (brief) : organizerClubId = club de l'équipe domicile ou extérieure.
    for (const e of await db.encounter.findMany({ include: { homeTeam: true, awayTeam: true } })) {
      expect([e.homeTeam.clubId, e.awayTeam.clubId]).toContain(e.organizerClubId);
    }
  });
});

describe("composition (R4)", () => {
  it("joueurs pris dans les effectifs ; un seul simple par joueur", async () => {
    const { id } = await create();
    await addMatch(capA, id, { homePlayerId: p1, awayPlayerId: x1 }, T0);
    await expect(addMatch(capA, id, { homePlayerId: x2, awayPlayerId: p2 }, T0)).rejects.toMatchObject({ code: "INVALID" });
    await expect(addMatch(capA, id, { homePlayerId: p1, awayPlayerId: x2 }, T0)).rejects.toMatchObject({ code: "INVALID" });
    await expect(addMatch(capA, id, { homePlayerId: p2, awayPlayerId: x1 }, T0)).rejects.toMatchObject({ code: "INVALID" });
    await expect(addMatch(capA, id, { homePlayerId: p2, awayPlayerId: x2 }, T0)).resolves.toHaveProperty("id");
  });

  it("équipe à l'extérieur : les côtés suivent domicile / extérieur", async () => {
    const { id } = await create(capA, { clubTeamIsHome: false });
    await expect(addMatch(capA, id, { homePlayerId: p1, awayPlayerId: x1 }, T0)).rejects.toMatchObject({ code: "INVALID" });
    await expect(addMatch(capA, id, { homePlayerId: x1, awayPlayerId: p1 }, T0)).resolves.toHaveProperty("id");
  });

  it("seuls le capitaine de l'équipe et les admins composent", async () => {
    const { id } = await create();
    await expect(addMatch(capB, id, { homePlayerId: p1, awayPlayerId: x1 }, T0)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(addMatch(member, id, { homePlayerId: p1, awayPlayerId: x1 }, T0)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(addMatch(outsider, id, { homePlayerId: p1, awayPlayerId: x1 }, T0)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(addMatch(admin, id, { homePlayerId: p1, awayPlayerId: x1 }, T0)).resolves.toHaveProperty("id");
  });

  it("pas de limite du nombre de matchs (il dépend du niveau de la rencontre)", async () => {
    const { id } = await create();
    const homes = await Promise.all(
      Array.from({ length: 12 }, (_, i) => addNewPlayerToTeam(admin, m1, { firstName: "H", lastName: `N${i}`, fftRank: "R30" })),
    );
    const aways = await Promise.all(
      Array.from({ length: 12 }, (_, i) => addNewPlayerToTeam(admin, ext, { firstName: "A", lastName: `N${i}`, fftRank: "R30" })),
    );
    for (let i = 0; i < 12; i++) await addMatch(capA, id, { homePlayerId: homes[i]!.id, awayPlayerId: aways[i]!.id }, T0);
    expect(await db.match.count({ where: { encounterId: id, voidedAt: null } })).toBe(12);
  });

  it("brouillon : modifier change le match sur place, retirer le supprime", async () => {
    const { id } = await create();
    const m = await addMatch(capA, id, { homePlayerId: p1, awayPlayerId: x1 }, T0);
    await replaceMatch(capA, m.id, { homePlayerId: p2, awayPlayerId: x1 }, T0);
    expect(await db.match.findUniqueOrThrow({ where: { id: m.id } })).toMatchObject({ homePlayerId: p2, voidedAt: null });
    await removeMatch(capA, m.id, T0);
    expect(await db.match.count({ where: { encounterId: id } })).toBe(0);
  });
});

describe("publication (R5) et cotes figées", () => {
  it("refusée sans match, puis fige les cotes de chaque match", async () => {
    const { id } = await create();
    await expect(publishEncounter(capA, id, T0)).rejects.toMatchObject({ code: "INVALID" });
    await addMatch(capA, id, { homePlayerId: p1, awayPlayerId: x1 }, T0); // 30 contre 30/1 : 1 échelon en faveur de Léa (p1)
    await addMatch(capA, id, { homePlayerId: p2, awayPlayerId: x3 }, T0); // 30/1 contre NC : borne
    await publishEncounter(capA, id, T0);

    const e = await db.encounter.findUniqueOrThrow({ where: { id }, include: { matches: { orderBy: { order: "asc" } } } });
    expect(e.status).toBe("OPEN");
    expect(e.predictionsCloseAt).toEqual(START);
    expect(e.matches.map((m) => [m.oddsHomeX100, m.oddsAwayX100])).toEqual([
      [156, 278],
      [114, 833],
    ]);
    expect(e.matches[0]!.oddsComputedAt).toEqual(T0);
    expect(e.matches[0]!.oddsInputs).toMatchObject({ configVersion: "v1-non-calibre-2026-10-07", rankHome: "R30", rankAway: "R30_1" });
  });

  it("publier deux fois est une transition refusée", async () => {
    const { id } = await create();
    await addMatch(capA, id, { homePlayerId: p1, awayPlayerId: x1 }, T0);
    await publishEncounter(capA, id, T0);
    await expect(publishEncounter(capA, id, T0)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });

  it("refusée si l'heure de début est passée", async () => {
    const { id } = await create();
    await addMatch(capA, id, { homePlayerId: p1, awayPlayerId: x1 }, T0);
    await expect(publishEncounter(capA, id, after(START, 1))).rejects.toMatchObject({ code: "INVALID" });
  });

  it("utilise l'historique confirmé : forme et confrontation directe", async () => {
    // Rencontre passée et confirmée où Léa (p1) a battu Paul (x1).
    await db.encounter.create({
      data: {
        organizerClubId: clubId,
        homeTeamId: m1,
        awayTeamId: ext,
        startsAt: new Date("2026-09-01T12:00:00Z"),
        predictionsCloseAt: new Date("2026-09-01T12:00:00Z"),
        status: "CONFIRMED",
        createdById: admin,
        matches: { create: { order: 1, homePlayerId: p1, awayPlayerId: x1, outcome: "COMPLETED", winnerSide: "HOME" } },
      },
    });
    const { id } = await create();
    await addMatch(capA, id, { homePlayerId: p1, awayPlayerId: x1 }, T0);
    await publishEncounter(capA, id, T0);
    const m = await db.match.findFirstOrThrow({ where: { encounterId: id } });
    const expected = computeOdds({ rankA: "R30", rankB: "R30_1", formA: ["W"], formB: ["L"], h2h: { winsA: 1, winsB: 0 } });
    expect([m.oddsHomeX100, m.oddsAwayX100]).toEqual([expected.oddsX100A, expected.oddsX100B]);
    expect(m.oddsInputs).toMatchObject({ formHome: ["W"], formAway: ["L"], h2h: { winsA: 1, winsB: 0 } });
    expect(expected.breakdown.diff).toBe(100 + 10 + 10 + 15);
  });
});

describe("LOCKED dérivé, modifications et report (R6)", () => {
  async function published() {
    const { id } = await create();
    const a = await addMatch(capA, id, { homePlayerId: p1, awayPlayerId: x1 }, T0);
    const b = await addMatch(capA, id, { homePlayerId: p2, awayPlayerId: x2 }, T0);
    await publishEncounter(capA, id, T0);
    return { id, a: a.id, b: b.id };
  }

  it("à l'heure de début, la rencontre est LOCKED sans aucune écriture en base", async () => {
    const { id } = await published();
    expect((await getEncounterPage(null, id, after(START, -1))).status).toBe("OPEN");
    expect((await getEncounterPage(null, id, START)).status).toBe("LOCKED");
    expect((await db.encounter.findUniqueOrThrow({ where: { id } })).status).toBe("OPEN");
  });

  it("après publication, avant le début : ajouter un match lui donne des cotes", async () => {
    const { id } = await published();
    const c = await addMatch(capA, id, { homePlayerId: p3, awayPlayerId: x3 }, T0);
    const m = await db.match.findUniqueOrThrow({ where: { id: c.id } });
    expect(m.oddsHomeX100).not.toBeNull();
  });

  it("modifier un match publié : pronostics remboursés, ancien match conservé, nouveau match avec cotes", async () => {
    const { a } = await published();
    const before = await getBalance(punter);
    const pr = await predict(punter, a, 100);
    expect(await getBalance(punter)).toBe(before - 100);

    const r = await replaceMatch(capA, a, { homePlayerId: p3, awayPlayerId: x1 }, T0);
    expect(r.refunded).toBe(1);
    expect(r.id).not.toBe(a);
    expect((await db.match.findUniqueOrThrow({ where: { id: a } })).voidedAt).toEqual(T0);
    expect(await db.prediction.findUniqueOrThrow({ where: { id: pr } })).toMatchObject({ status: "REFUNDED", payoutAces: 100 });
    expect(await getBalance(punter)).toBe(before);
    const fresh = await db.match.findUniqueOrThrow({ where: { id: r.id } });
    expect(fresh.oddsHomeX100).not.toBeNull();
    expect(fresh.order).toBe(3); // numéro suivant, l'ancien reste réservé
    const page = await getEncounterPage(null, fresh.encounterId, T0);
    expect(page.matches.map((m) => m.number)).toEqual([1, 2]);
  });

  it("le remboursement est idempotent", async () => {
    const { a } = await published();
    await predict(punter, a, 50);
    await removeMatch(capA, a, T0);
    const balance = await getBalance(punter);
    const again = await db.$transaction((tx) => refundPendingPredictions(tx, { matchId: a }, T0));
    expect(again).toBe(0);
    expect(await getBalance(punter)).toBe(balance);
    expect(await db.ledgerEntry.count({ where: { type: "PREDICTION_REFUND" } })).toBe(1);
  });

  it("retirer le dernier match d'une rencontre publiée est refusé", async () => {
    const { a, b } = await published();
    await removeMatch(capA, a, T0);
    await expect(removeMatch(capA, b, T0)).rejects.toMatchObject({ code: "INVALID" });
  });

  it("après le début : composition figée", async () => {
    const { id, a } = await published();
    await expect(addMatch(capA, id, { homePlayerId: p3, awayPlayerId: x3 }, START)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(replaceMatch(capA, a, { homePlayerId: p3, awayPlayerId: x1 }, START)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(removeMatch(capA, a, START)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });

  it("report avant le début : début et fermeture des pronostics bougent ensemble", async () => {
    const { id } = await published();
    const later = new Date("2026-10-19T12:00:00Z");
    await rescheduleEncounter(capA, id, later, T0);
    const e = await db.encounter.findUniqueOrThrow({ where: { id } });
    expect([e.startsAt, e.predictionsCloseAt]).toEqual([later, later]);
    expect((await getEncounterPage(null, id, after(START, 60))).status).toBe("OPEN");
  });

  it("report après le début : les pronostics restent fermés", async () => {
    const { id } = await published();
    const later = new Date("2026-10-19T12:00:00Z");
    await rescheduleEncounter(capA, id, later, after(START, 30));
    const e = await db.encounter.findUniqueOrThrow({ where: { id } });
    expect(e.startsAt).toEqual(later);
    expect(e.predictionsCloseAt).toEqual(START);
    expect((await getEncounterPage(null, id, after(START, 60))).status).toBe("LOCKED");
    const events = await db.encounterEvent.findMany({ where: { encounterId: id, note: "Report" } });
    expect(events[0]?.payload).toMatchObject({ predictionsStayClosed: true });
  });

  it("report : date future obligatoire, et impossible une fois le score proposé", async () => {
    const { id } = await published();
    await expect(rescheduleEncounter(capA, id, after(T0, -5), T0)).rejects.toMatchObject({ code: "INVALID" });
    await db.encounter.update({ where: { id }, data: { status: "SCORE_PROPOSED" } });
    await expect(rescheduleEncounter(capA, id, new Date("2026-11-01T12:00:00Z"), after(START, 120))).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
    });
  });
});

describe("annulation (R7) et suppression", () => {
  it("capitaine de l'équipe du club et admins seulement", async () => {
    const { id } = await create();
    await expect(cancelEncounter(capB, id, undefined, T0)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(cancelEncounter(member, id, undefined, T0)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(cancelEncounter(outsider, id, undefined, T0)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await cancelEncounter(admin, id, "Pluie", T0);
    expect((await db.encounter.findUniqueOrThrow({ where: { id } })).status).toBe("CANCELLED");
  });

  it("annuler une rencontre ouverte ou verrouillée rembourse tous les pronostics en attente", async () => {
    const { id } = await create();
    const a = await addMatch(capA, id, { homePlayerId: p1, awayPlayerId: x1 }, T0);
    const b = await addMatch(capA, id, { homePlayerId: p2, awayPlayerId: x2 }, T0);
    await publishEncounter(capA, id, T0);
    const before = await getBalance(punter);
    await predict(punter, a.id, 100);
    await predict(punter, b.id, 30);
    const r = await cancelEncounter(capA, id, "Report pluie", after(START, 10)); // LOCKED
    expect(r.refunded).toBe(2);
    expect(await getBalance(punter)).toBe(before);
    await expect(cancelEncounter(capA, id, undefined, T0)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });

  it("annulation impossible une fois le score proposé", async () => {
    const { id } = await create();
    await db.encounter.update({ where: { id }, data: { status: "SCORE_PROPOSED" } });
    await expect(cancelEncounter(capA, id, undefined, T0)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });

  it("supprimer : brouillon seulement", async () => {
    const draft = await create();
    await deleteDraft(capA, draft.id, T0);
    expect(await db.encounter.count({ where: { id: draft.id } })).toBe(0);

    const { id } = await create();
    await addMatch(capA, id, { homePlayerId: p1, awayPlayerId: x1 }, T0);
    await publishEncounter(capA, id, T0);
    await expect(deleteDraft(capA, id, T0)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });
});

describe("lecture (R8)", () => {
  it("brouillon : invisible pour un anonyme et un simple membre ; visible pour admins et capitaines", async () => {
    const { id } = await create();
    await expect(getEncounterPage(null, id, T0)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getEncounterPage(member, id, T0)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getEncounterPage(outsider, id, T0)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getEncounterPage(capB, id, T0)).resolves.toHaveProperty("status", "DRAFT");
    await expect(getEncounterPage(admin, id, T0)).resolves.toHaveProperty("status", "DRAFT");
  });

  it("publiée : visible sans compte, joueurs en « Prénom Nom », aucune donnée de gestion", async () => {
    const { id } = await create();
    await addMatch(capA, id, { homePlayerId: p1, awayPlayerId: x1 }, T0);
    await publishEncounter(capA, id, T0);
    const page = await getEncounterPage(null, id, T0);
    expect(page.home).toBe("TC Ralli · Messieurs 1");
    expect(page.away).toBe("TC Voisin 1");
    expect(page.matches[0]).toMatchObject({ number: 1, home: { name: "Léa Martin", rank: "30" }, away: { name: "Paul Voisin", rank: "30/1" }, oddsHome: "1,56", oddsAway: "2,78" });
    expect(page.manage).toBeNull();
    expect((await getEncounterPage(member, id, T0)).manage).toBeNull();
    expect((await getEncounterPage(capB, id, T0)).manage).toBeNull();
    expect((await getEncounterPage(capA, id, T0)).manage).not.toBeNull();
  });

  it("liste du club : brouillons réservés aux admins et capitaines", async () => {
    await create();
    expect(await listClubEncounters(member, clubId, T0)).toEqual([]);
    expect(await listClubEncounters(capB, clubId, T0)).toHaveLength(1);
    await expect(listClubEncounters(outsider, clubId, T0)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
