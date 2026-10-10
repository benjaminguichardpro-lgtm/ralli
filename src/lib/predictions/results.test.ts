import { describe, expect, it } from "vitest";
import { filterCounts, formatDelta, groupByEncounter, hitsSentence, parseLimit, parseResultFilter, resultLine, summarize } from "./results";

const totals = { won: { count: 3, committed: 250, payout: 560 }, lost: { count: 2, committed: 150 }, refunded: { count: 4 } };

describe("résumé des rallis terminés", () => {
  it("compte gagnés et perdus, jamais les remboursés, et calcule bénéfice et taux", () => {
    expect(summarize(totals)).toEqual({ finished: 5, won: 3, lost: 2, refunded: 4, hitRate: 60, committedAces: 400, wonAces: 560, netAces: 160 });
  });
  it("sans gagné ni perdu : pas de taux, bénéfice nul (les remboursés ne comptent pas)", () => {
    const s = summarize({ won: { count: 0, committed: 0, payout: 0 }, lost: { count: 0, committed: 0 }, refunded: { count: 7 } });
    expect(s).toMatchObject({ finished: 0, hitRate: null, committedAces: 0, wonAces: 0, netAces: 0, refunded: 7 });
  });
  it("bénéfice négatif quand on a surtout perdu", () => {
    expect(summarize({ won: { count: 1, committed: 50, payout: 78 }, lost: { count: 3, committed: 300 }, refunded: { count: 0 } }).netAces).toBe(-272);
  });
  it("taux arrondi à l'entier", () => {
    expect(summarize({ won: { count: 1, committed: 10, payout: 20 }, lost: { count: 2, committed: 20 }, refunded: { count: 0 } }).hitRate).toBe(33);
    expect(summarize({ won: { count: 2, committed: 10, payout: 20 }, lost: { count: 1, committed: 20 }, refunded: { count: 0 } }).hitRate).toBe(67);
  });
  it("compteurs des puces de filtre", () => {
    expect(filterCounts(totals)).toEqual({ tous: 9, gagnes: 3, perdus: 2, rembourses: 4 });
  });
  it("phrase de bilan avec le mot « ralli », accordée", () => {
    expect(hitsSentence(summarize(totals))).toBe("3 rallis justes sur 5");
    expect(hitsSentence(summarize({ won: { count: 1, committed: 10, payout: 20 }, lost: { count: 1, committed: 10 }, refunded: { count: 0 } }))).toBe("1 ralli juste sur 2");
    expect(hitsSentence(summarize({ won: { count: 0, committed: 0, payout: 0 }, lost: { count: 0, committed: 0 }, refunded: { count: 0 } }))).toBe("Aucun ralli terminé pour l'instant");
  });
});

describe("ligne d'un ralli", () => {
  it("gagné : le bénéfice (gain − engagés), perdu : l'engagé en négatif, remboursé : rien", () => {
    expect(resultLine({ status: "WON", committedAces: 100, payoutAces: 278 })).toEqual({ label: "Gagné", delta: "+178 Aces", tone: "won" });
    expect(resultLine({ status: "LOST", committedAces: 100, payoutAces: 0 })).toEqual({ label: "Perdu", delta: "−100 Aces", tone: "lost" });
    expect(resultLine({ status: "REFUNDED", committedAces: 100, payoutAces: 100 })).toEqual({ label: "Remboursé", delta: null, tone: "neutral" });
  });
  it("format des montants", () => {
    expect(formatDelta(1250).replace(/\s/g, " ")).toBe("+1 250 Aces");
    expect(formatDelta(-5)).toBe("−5 Aces");
    expect(formatDelta(0)).toBe("0 Aces");
  });
});

describe("filtres et pagination dans l'adresse", () => {
  it("valeur inconnue = Tous", () => {
    expect(parseResultFilter("gagnes")).toBe("gagnes");
    expect(parseResultFilter(["perdus", "x"])).toBe("perdus");
    for (const bad of [undefined, "", "WON", "<script>", "tous2"]) expect(parseResultFilter(bad as string)).toBe("tous");
  });
  it("limite : paliers de 20, entre 20 et 200", () => {
    expect(parseLimit(undefined)).toBe(20);
    expect(parseLimit("40")).toBe(40);
    expect(parseLimit("45")).toBe(60);
    expect(parseLimit("0")).toBe(20);
    expect(parseLimit("-5")).toBe(20);
    expect(parseLimit("abc")).toBe(20);
    expect(parseLimit("99999")).toBe(20); // plus de 4 chiffres : refusé
    expect(parseLimit("5000")).toBe(200);
  });
});

describe("regroupement par rencontre", () => {
  it("garde l'ordre (le plus récent d'abord) et regroupe les lignes d'une même rencontre", () => {
    const g = groupByEncounter([
      { encounterId: "b", n: 1 },
      { encounterId: "a", n: 2 },
      { encounterId: "b", n: 3 },
    ]);
    expect(g.map((x) => [x.encounterId, x.items.map((i) => i.n)])).toEqual([["b", [1, 3]], ["a", [2]]]);
  });
  it("liste vide", () => {
    expect(groupByEncounter([])).toEqual([]);
  });
});
