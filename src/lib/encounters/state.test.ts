import { describe, expect, it } from "vitest";
import {
  type EffectiveStatus,
  type EncounterAction,
  InvalidTransitionError,
  STATUS_LABELS,
  TRANSITIONS,
  canDelete,
  canEditComposition,
  canReschedule,
  effectiveStatus,
  nextStatus,
  predictionsCloseAfterReschedule,
} from "./state";

const ALL: EffectiveStatus[] = ["DRAFT", "OPEN", "LOCKED", "SCORE_PROPOSED", "DISPUTED", "CONFIRMED", "CANCELLED"];
const ACTIONS: EncounterAction[] = ["publish", "proposeScore", "withdrawScore", "confirmScore", "disputeScore", "resolveDispute", "cancel"];

// Table attendue, écrite indépendamment du module : action → { état de départ → état d'arrivée }.
const EXPECTED: Record<EncounterAction, Partial<Record<EffectiveStatus, string>>> = {
  publish: { DRAFT: "OPEN" },
  proposeScore: { LOCKED: "SCORE_PROPOSED" },
  withdrawScore: { SCORE_PROPOSED: "OPEN" },
  confirmScore: { SCORE_PROPOSED: "CONFIRMED" },
  disputeScore: { SCORE_PROPOSED: "DISPUTED" },
  resolveDispute: { DISPUTED: "CONFIRMED" },
  cancel: { DRAFT: "CANCELLED", OPEN: "CANCELLED", LOCKED: "CANCELLED" },
};

describe("effectiveStatus (LOCKED dérivé à la lecture)", () => {
  const close = new Date("2026-10-12T12:00:00Z");
  it("OPEN avant l'heure de fermeture reste OPEN", () => {
    expect(effectiveStatus({ status: "OPEN", predictionsCloseAt: close }, new Date("2026-10-12T11:59:59.999Z"))).toBe("OPEN");
  });
  it("OPEN à l'heure pile devient LOCKED", () => {
    expect(effectiveStatus({ status: "OPEN", predictionsCloseAt: close }, close)).toBe("LOCKED");
  });
  it("les autres statuts ne dépendent pas de l'heure", () => {
    for (const s of ["DRAFT", "SCORE_PROPOSED", "DISPUTED", "CONFIRMED", "CANCELLED"] as const) {
      expect(effectiveStatus({ status: s, predictionsCloseAt: close }, new Date("2030-01-01"))).toBe(s);
    }
  });
});

describe("transitions", () => {
  it.each(ACTIONS.flatMap((a) => ALL.map((s) => [a, s] as const)))("%s depuis %s", (action, from) => {
    const expected = EXPECTED[action][from];
    if (expected) {
      expect(nextStatus(action, from)).toBe(expected);
    } else {
      expect(() => nextStatus(action, from)).toThrow(InvalidTransitionError);
    }
  });

  it("message d'erreur clair, en français", () => {
    expect(() => nextStatus("publish", "CONFIRMED")).toThrow("Impossible de publier : la rencontre est « Terminée ».");
    expect(() => nextStatus("cancel", "SCORE_PROPOSED")).toThrow("Impossible d'annuler : la rencontre est « Score proposé ».");
  });

  it("seul CONFIRMED est atteint par confirmScore et resolveDispute (déclencheurs du règlement)", () => {
    const toConfirmed = TRANSITIONS.filter((t) => t.to === "CONFIRMED").map((t) => t.action);
    expect(toConfirmed.sort()).toEqual(["confirmScore", "resolveDispute"]);
  });

  it("aucune transition ne sort d'un état final", () => {
    for (const t of TRANSITIONS) {
      expect(t.from).not.toContain("CONFIRMED");
      expect(t.from).not.toContain("CANCELLED");
    }
  });

  it("chaque statut a un libellé", () => {
    for (const s of ALL) expect(STATUS_LABELS[s]).toBeTruthy();
  });
});

describe("modifications hors transition (R6)", () => {
  it.each(ALL)("droits en %s", (s) => {
    expect(canEditComposition(s)).toBe(s === "DRAFT" || s === "OPEN");
    expect(canReschedule(s)).toBe(s === "DRAFT" || s === "OPEN" || s === "LOCKED");
    expect(canDelete(s)).toBe(s === "DRAFT");
  });

  it("report avant la fermeture : la fermeture suit la nouvelle heure", () => {
    const e = { status: "OPEN" as const, predictionsCloseAt: new Date("2026-10-12T12:00:00Z") };
    const later = new Date("2026-10-19T12:00:00Z");
    expect(predictionsCloseAfterReschedule(e, later, new Date("2026-10-11T00:00:00Z"))).toEqual(later);
  });

  it("report après la fermeture : la fermeture ne bouge pas (pronostics jamais rouverts)", () => {
    const e = { status: "OPEN" as const, predictionsCloseAt: new Date("2026-10-12T12:00:00Z") };
    const later = new Date("2026-10-19T12:00:00Z");
    const r = predictionsCloseAfterReschedule(e, later, new Date("2026-10-12T13:00:00Z"));
    expect(r).toEqual(e.predictionsCloseAt);
    expect(effectiveStatus({ status: "OPEN", predictionsCloseAt: r }, new Date("2026-10-13T00:00:00Z"))).toBe("LOCKED");
  });
});
