import { describe, expect, it } from "vitest";
import { InvalidLocalTimeError, formatParis, parseParisLocal, toParisLocalInput } from "./time";

describe("parseParisLocal", () => {
  it("heure d'hiver : Paris = UTC+1", () => {
    expect(parseParisLocal("2026-01-15T14:30").toISOString()).toBe("2026-01-15T13:30:00.000Z");
  });

  it("heure d'été : Paris = UTC+2", () => {
    expect(parseParisLocal("2026-07-15T14:30").toISOString()).toBe("2026-07-15T12:30:00.000Z");
  });

  it("veille et lendemain du passage à l'heure d'été (29 mars 2026)", () => {
    expect(parseParisLocal("2026-03-29T01:30").toISOString()).toBe("2026-03-29T00:30:00.000Z");
    expect(parseParisLocal("2026-03-29T03:30").toISOString()).toBe("2026-03-29T01:30:00.000Z");
  });

  it("heure inexistante (2 h 30 le jour du passage à l'heure d'été) : refusée", () => {
    expect(() => parseParisLocal("2026-03-29T02:30")).toThrow(InvalidLocalTimeError);
  });

  it("heure ambiguë (2 h 30 le jour du retour à l'heure d'hiver, 25 octobre 2026) : première occurrence", () => {
    expect(parseParisLocal("2026-10-25T02:30").toISOString()).toBe("2026-10-25T00:30:00.000Z");
  });

  it("refuse un format invalide", () => {
    for (const v of ["", "2026-10-12", "2026-10-12 14:30", "12/10/2026 14:30", "2026-13-01T10:00"]) {
      expect(() => parseParisLocal(v)).toThrow(InvalidLocalTimeError);
    }
  });
});

describe("toParisLocalInput", () => {
  it("aller-retour exact, été comme hiver", () => {
    for (const v of ["2026-01-15T14:30", "2026-07-15T09:05", "2026-03-29T03:00", "2026-12-31T23:59"]) {
      expect(toParisLocalInput(parseParisLocal(v))).toBe(v);
    }
  });
});

describe("formatParis", () => {
  it("affichage français en heure de Paris", () => {
    expect(formatParis(new Date("2026-10-12T12:30:00Z"))).toBe("lundi 12 octobre 2026 à 14:30");
  });
});
