import { describe, expect, it } from "vitest";
import { WIN_COMMENT_MAX, reportReasonSchema, shareState, whatsappText, winCardSummary, winCommentSchema } from "./win-cards";

const now = new Date("2026-10-14T12:00:00Z");
const SEVEN_DAYS = 7 * 24 * 3_600_000; // écrit en dur : le test doit casser si la règle change
const settled = (agoMs: number) => new Date(now.getTime() - agoMs);
const base = { status: "WON" as const, settledAt: settled(3_600_000), encounterConfirmed: true, alreadyShared: false, isMember: true };

describe("partage d'un ralli gagné", () => {
  it("gagné, réglé, récent, pas encore partagé : on peut", () => {
    expect(shareState(base, now)).toBe("can");
  });
  it("perdu, remboursé, en cours : pas de bouton", () => {
    for (const status of ["LOST", "REFUNDED", "PENDING"] as const) expect(shareState({ ...base, status }, now)).toBe("no");
    expect(shareState({ ...base, settledAt: null }, now)).toBe("no");
  });
  it("déjà partagé : une seule carte par ralli", () => {
    expect(shareState({ ...base, alreadyShared: true }, now)).toBe("shared");
  });
  it("quelqu'un qui a quitté le club ne peut plus partager", () => {
    expect(shareState({ ...base, isMember: false }, now)).toBe("closed");
  });
  it("7 jours exactement : encore possible ; au-delà : fermé", () => {
    expect(shareState({ ...base, settledAt: settled(SEVEN_DAYS) }, now)).toBe("can");
    expect(shareState({ ...base, settledAt: settled(SEVEN_DAYS + 1) }, now)).toBe("closed");
  });
  it("rencontre non confirmée (score contesté ou annulée) : fermé", () => {
    expect(shareState({ ...base, encounterConfirmed: false }, now)).toBe("closed");
  });
});

describe("commentaire de la carte", () => {
  it("facultatif : vide accepté, espaces retirés", () => {
    expect(winCommentSchema.parse("")).toBe("");
    expect(winCommentSchema.parse("  Quel match !  ")).toBe("Quel match !");
  });
  it("140 caractères au plus", () => {
    expect(winCommentSchema.safeParse("a".repeat(WIN_COMMENT_MAX)).success).toBe(true);
    expect(winCommentSchema.safeParse("a".repeat(WIN_COMMENT_MAX + 1)).success).toBe(false);
  });
  it("mots interdits refusés", () => {
    for (const t of ["Beau pari !", "Ma mise a payé", "100 euros", "bookmaker"]) expect(winCommentSchema.safeParse(t).success, t).toBe(false);
  });
});

describe("signalement et textes", () => {
  it("motif facultatif, 200 caractères au plus ; vide = null", () => {
    expect(reportReasonSchema.parse("  ")).toBeNull();
    expect(reportReasonSchema.parse("Propos déplacés")).toBe("Propos déplacés");
    expect(reportReasonSchema.safeParse("a".repeat(201)).success).toBe(false);
  });
  it("texte WhatsApp et résumé de la carte sans mot interdit", () => {
    const text = whatsappText(1340, "Léa Martin contre Sara T.");
    expect(text).toBe(`J'ai gagné ${(1340).toLocaleString("fr-FR")} Aces sur Léa Martin contre Sara T. avec Ralli !`);
    expect(winCardSummary({ author: "Hugo", matchLabel: "Léa Martin contre Sara T.", pickedName: "Léa Martin", committedAces: 100, odds: "3,40", payoutAces: 340 })).toContain("cote 3,40");
    expect(winCommentSchema.safeParse(text).success).toBe(true);
  });
});
