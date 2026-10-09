import { describe, expect, it } from "vitest";
import { ODDS_CONFIG, type OddsConfig } from "@/config/odds";
import type { FftRank } from "@/generated/prisma/enums";
import { FFT_RANKS } from "@/lib/fft";
import {
  type MatchResult,
  type OddsInput,
  computeDoublesOdds,
  computeOdds,
  eloProbability,
  formAdjustment,
  formatOdds,
  h2hAdjustment,
  oddsX100FromProbability,
  ratingOf,
} from "./model";

const base = (patch: Partial<OddsInput> = {}): OddsInput => ({
  rankA: "R30",
  rankB: "R30",
  formA: [],
  formB: [],
  h2h: { winsA: 0, winsB: 0 },
  ...patch,
});

const odds = (input: OddsInput) => {
  const r = computeOdds(input);
  return [r.oddsX100A, r.oddsX100B];
};

describe("constantes", () => {
  it("valeurs de départ du brief, marquées non calibrées", () => {
    expect(ODDS_CONFIG).toMatchObject({
      calibrated: false,
      ratingStep: 100,
      eloDivisor: 400,
      formWindow: 5,
      formPointsPerNetWin: 10,
      h2hPointsPerNetWin: 15,
      probabilityMin: 0.12,
      probabilityMax: 0.88,
    });
    expect(ODDS_CONFIG.version).toMatch(/non-calibre/);
  });
});

describe("rating FFT", () => {
  it("échelle ordonnée : NC = 0, puis +100 par échelon jusqu'à la 1re série", () => {
    expect(ratingOf("NC")).toBe(0);
    expect(ratingOf("R40")).toBe(100);
    expect(ratingOf("R30")).toBe(700);
    expect(ratingOf("R15")).toBe(1300);
    expect(ratingOf("R0")).toBe(1900);
    expect(ratingOf("RM30")).toBe(2300);
    expect(ratingOf("PREMIERE_SERIE")).toBe(2400);
    const ratings = FFT_RANKS.map((r) => ratingOf(r.value));
    expect(ratings).toEqual([...ratings].sort((a, b) => a - b));
    expect(new Set(ratings).size).toBe(FFT_RANKS.length);
  });

  it("le pas est paramétrable", () => {
    expect(ratingOf("R40", { ...ODDS_CONFIG, ratingStep: 50 })).toBe(50);
  });
});

describe("formule Elo et arrondi des cotes", () => {
  it("P(écart 0) = 0,5 ; P(+100) ≈ 0,640 ; P(+400) ≈ 0,909", () => {
    expect(eloProbability(0)).toBe(0.5);
    expect(eloProbability(100)).toBeCloseTo(0.640065, 6);
    expect(eloProbability(400)).toBeCloseTo(0.909091, 6);
  });

  it("cote = round(100 / P) en centièmes", () => {
    expect(oddsX100FromProbability(0.5)).toBe(200);
    expect(oddsX100FromProbability(0.88)).toBe(114); // 113,64
    expect(oddsX100FromProbability(0.12)).toBe(833); // 833,33
    expect(() => oddsX100FromProbability(0)).toThrow(RangeError);
  });

  it("affichage français", () => {
    expect(formatOdds(156)).toBe("1,56");
    expect(formatOdds(200)).toBe("2,00");
    expect(formatOdds(833)).toBe("8,33");
  });
});

describe("cas limites demandés", () => {
  it("égalité parfaite, sans historique : 50/50, cotes 2,00 / 2,00", () => {
    const r = computeOdds(base());
    expect(r.probabilityA).toBe(0.5);
    expect(r.probabilityB).toBe(0.5);
    expect([r.oddsX100A, r.oddsX100B]).toEqual([200, 200]);
  });

  it("égalité de niveau entre deux NC, et entre deux 1re série : même résultat", () => {
    expect(odds(base({ rankA: "NC", rankB: "NC" }))).toEqual([200, 200]);
    expect(odds(base({ rankA: "PREMIERE_SERIE", rankB: "PREMIERE_SERIE" }))).toEqual([200, 200]);
  });

  it("absence d'historique : forme et H2H nuls", () => {
    const r = computeOdds(base({ rankA: "R15", rankB: "R30" }));
    expect(r.breakdown).toMatchObject({ formAdjA: 0, formAdjB: 0, h2hAdj: 0, diff: 600 });
  });

  it("écarts croissants : 1, 2 et 3 échelons", () => {
    expect(odds(base({ rankA: "R30_4", rankB: "R30_5" }))).toEqual([156, 278]);
    expect(odds(base({ rankA: "R30_3", rankB: "R30_5" }))).toEqual([132, 416]);
    expect(odds(base({ rankA: "R30_2", rankB: "R30_5" }))).toEqual([118, 662]);
  });

  it("borne haute atteinte dès 4 échelons : 1,14 / 8,33", () => {
    const r = computeOdds(base({ rankA: "R30_1", rankB: "R30_5" }));
    expect(r.rawProbabilityA).toBeCloseTo(0.909091, 6);
    expect(r.probabilityA).toBe(0.88);
    expect([r.oddsX100A, r.oddsX100B]).toEqual([114, 833]);
  });

  it("écart extrême (NC contre 1re série) : bornes 8,33 / 1,14, jamais au-delà", () => {
    const r = computeOdds(base({ rankA: "NC", rankB: "PREMIERE_SERIE" }));
    expect(r.rawProbabilityA).toBeLessThan(1e-5);
    expect(r.probabilityA).toBeCloseTo(0.12, 12);
    expect([r.oddsX100A, r.oddsX100B]).toEqual([833, 114]);
  });

  it("bornes : les cotes restent toujours dans [1,14 ; 8,33] et dans la contrainte SQL [1,00 ; 10,00]", () => {
    for (const a of FFT_RANKS) {
      for (const b of FFT_RANKS) {
        const [oa, ob] = odds(base({ rankA: a.value, rankB: b.value, formA: ["W", "W", "W", "W", "W"], h2h: { winsA: 3, winsB: 0 } }));
        for (const o of [oa!, ob!]) {
          expect(o).toBeGreaterThanOrEqual(114);
          expect(o).toBeLessThanOrEqual(833);
        }
      }
    }
  });
});

describe("forme (5 derniers matchs)", () => {
  it("(victoires − défaites) × 10", () => {
    expect(formAdjustment(["W", "W", "L"])).toBe(10);
    expect(formAdjustment(["L", "L", "L", "L", "L"])).toBe(-50);
    expect(formAdjustment([])).toBe(0);
  });

  it("seuls les 5 plus récents comptent", () => {
    const six: MatchResult[] = ["W", "W", "W", "W", "W", "L"];
    expect(formAdjustment(six)).toBe(50);
    const sixOld: MatchResult[] = ["L", "L", "L", "L", "L", "W"];
    expect(formAdjustment(sixOld)).toBe(-50);
  });

  it("moins de 5 matchs : on compte ceux qui existent", () => {
    expect(formAdjustment(["W"])).toBe(10);
  });

  it("forme parfaite contre forme nulle = un échelon d'écart", () => {
    const r = computeOdds(base({ formA: ["W", "W", "W", "W", "W"], formB: ["L", "L", "L", "L", "L"] }));
    expect(r.breakdown.diff).toBe(100);
    expect([r.oddsX100A, r.oddsX100B]).toEqual([156, 278]);
  });
});

describe("confrontations directes (H2H)", () => {
  it("(victoires A − victoires B) × 15 si au moins une confrontation", () => {
    expect(h2hAdjustment({ winsA: 2, winsB: 0 })).toBe(30);
    expect(h2hAdjustment({ winsA: 1, winsB: 3 })).toBe(-30);
    expect(h2hAdjustment({ winsA: 0, winsB: 0 })).toBe(0);
  });

  it("confrontations à égalité : correctif nul", () => {
    expect(h2hAdjustment({ winsA: 2, winsB: 2 })).toBe(0);
  });

  it("A a battu B deux fois : 1,84 / 2,19 à niveau égal", () => {
    expect(odds(base({ h2h: { winsA: 2, winsB: 0 } }))).toEqual([184, 219]);
  });

  it("refuse des compteurs invalides", () => {
    expect(() => h2hAdjustment({ winsA: -1, winsB: 0 })).toThrow(RangeError);
    expect(() => h2hAdjustment({ winsA: 1.5, winsB: 0 })).toThrow(RangeError);
  });
});

describe("symétrie", () => {
  const swap = (i: OddsInput): OddsInput => ({
    rankA: i.rankB,
    rankB: i.rankA,
    formA: i.formB,
    formB: i.formA,
    h2h: { winsA: i.h2h.winsB, winsB: i.h2h.winsA },
  });

  const forms: MatchResult[][] = [[], ["W"], ["L", "L"], ["W", "L", "W", "W", "L"], ["W", "W", "W", "W", "W", "L"]];
  const ranks: FftRank[] = ["NC", "R40", "R30_2", "R30", "R15_1", "R4_6", "RM15", "PREMIERE_SERIE"];
  const cases: OddsInput[] = [];
  for (const rankA of ranks)
    for (const rankB of ranks)
      for (const [fa, fb] of [[0, 1], [2, 3], [4, 0]] as const)
        for (const h2h of [{ winsA: 0, winsB: 0 }, { winsA: 2, winsB: 1 }])
          cases.push({ rankA, rankB, formA: forms[fa]!, formB: forms[fb]!, h2h });

  it(`P(A) + P(B) = 1 sur ${cases.length} cas`, () => {
    for (const c of cases) {
      const r = computeOdds(c);
      expect(r.probabilityA + r.probabilityB).toBeCloseTo(1, 12);
    }
  });

  it("échanger A et B échange exactement les résultats", () => {
    for (const c of cases) {
      const r = computeOdds(c);
      const s = computeOdds(swap(c));
      expect(s.probabilityA).toBeCloseTo(r.probabilityB, 12);
      expect(s.probabilityB).toBeCloseTo(r.probabilityA, 12);
      expect([s.oddsX100A, s.oddsX100B]).toEqual([r.oddsX100B, r.oddsX100A]);
      expect(s.breakdown.diff).toBe(-r.breakdown.diff);
    }
  });

  it("monotonie : un meilleur classement de A n'abaisse jamais P(A)", () => {
    for (let i = 1; i < FFT_RANKS.length; i++) {
      const lower = computeOdds(base({ rankA: FFT_RANKS[i - 1]!.value, rankB: "R15" }));
      const higher = computeOdds(base({ rankA: FFT_RANKS[i]!.value, rankB: "R15" }));
      expect(higher.probabilityA).toBeGreaterThanOrEqual(lower.probabilityA);
    }
  });
});

describe("garde-fous de configuration", () => {
  it("refuse des bornes non symétriques", () => {
    const bad: OddsConfig = { ...ODDS_CONFIG, probabilityMin: 0.12, probabilityMax: 0.9 };
    expect(() => computeOdds(base(), bad)).toThrow(/non symétriques/);
  });

  it("enregistre la version du modèle avec le résultat", () => {
    expect(computeOdds(base()).configVersion).toBe(ODDS_CONFIG.version);
  });
});

describe("cotes d'un double (moyenne des ratings de chaque paire)", () => {
  it("deux paires de même niveau moyen : cotes égales", () => {
    const r = computeDoublesOdds({ ranksA: ["R30", "R30"], ranksB: ["R30", "R30"] });
    expect([r.oddsX100A, r.oddsX100B]).toEqual([200, 200]);
  });

  it("la moyenne compte, pas le meilleur joueur : 15/5 + NC vaut 30/3 + 30/3", () => {
    const mixed = computeDoublesOdds({ ranksA: ["R15_5", "NC"], ranksB: ["R30_3", "R30_3"] });
    expect(mixed.breakdown.ratingA).toBe(ratingOf("R30_3"));
    expect(mixed.breakdown.ratingA).toBe((ratingOf("R15_5") + ratingOf("NC")) / 2);
    expect([mixed.oddsX100A, mixed.oddsX100B]).toEqual([200, 200]);
  });

  it("la paire la mieux classée a la cote la plus basse, avec un écart cohérent avec le simple", () => {
    const double = computeDoublesOdds({ ranksA: ["R30", "R30"], ranksB: ["R30_1", "R30_1"] });
    const single = computeOdds(base({ rankA: "R30", rankB: "R30_1" }));
    expect([double.oddsX100A, double.oddsX100B]).toEqual([single.oddsX100A, single.oddsX100B]);
    expect(double.oddsX100A).toBeLessThan(double.oddsX100B);
  });

  it("ni forme ni confrontations directes dans le détail du calcul", () => {
    const r = computeDoublesOdds({ ranksA: ["R30", "R30_1"], ranksB: ["R30_2", "R30_3"] });
    expect(r.breakdown).toMatchObject({ formAdjA: 0, formAdjB: 0, h2hAdj: 0 });
  });

  it("symétrique, borné à [0,12 ; 0,88] comme le simple", () => {
    const r = computeDoublesOdds({ ranksA: ["PREMIERE_SERIE", "PREMIERE_SERIE"], ranksB: ["NC", "NC"] });
    expect(r.probabilityA).toBeCloseTo(0.88, 10);
    expect(r.probabilityA + r.probabilityB).toBeCloseTo(1, 12);
    expect(r.oddsX100A).toBe(114);
    const swapped = computeDoublesOdds({ ranksA: ["NC", "NC"], ranksB: ["PREMIERE_SERIE", "PREMIERE_SERIE"] });
    expect([swapped.oddsX100A, swapped.oddsX100B]).toEqual([r.oddsX100B, r.oddsX100A]);
  });
});
