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

import { formatParisDay, formatParisTime, relativeDayLabel } from "./time";

describe("formats d'affichage (Paris)", () => {
  it("heure sur 24 h avec zéro initial, hiver et été", () => {
    expect(formatParisTime(new Date("2027-03-14T13:00:00Z"))).toBe("14:00"); // UTC+1
    expect(formatParisTime(new Date("2026-10-12T07:05:00Z"))).toBe("09:05"); // UTC+2
    expect(formatParisTime(new Date("2026-10-11T22:00:00Z"))).toBe("00:00");
  });
  it("jour en toutes lettres", () => {
    expect(formatParisDay(new Date("2027-03-14T13:00:00Z"))).toBe("dimanche 14 mars");
  });
});

describe("relativeDayLabel (jours calendaires de Paris)", () => {
  const now = new Date("2026-10-14T10:00:00Z"); // mercredi 14 octobre, Paris
  it.each([
    ["2026-10-14T21:30:00Z", "aujourd'hui"], // 23:30 à Paris, même jour
    ["2026-10-14T22:30:00Z", "demain"], // 00:30 le 15 à Paris
    ["2026-10-15T12:00:00Z", "demain"],
    ["2026-10-17T12:00:00Z", "dans 3 jours"],
    ["2026-10-20T12:00:00Z", "dans 6 jours"],
    ["2026-10-21T12:00:00Z", null],
    ["2026-10-13T12:00:00Z", null], // hier
  ])("%s → %s", (iso, label) => {
    expect(relativeDayLabel(new Date(iso), now)).toBe(label);
  });
  it("traverse le changement d'heure sans décalage d'un jour", () => {
    expect(relativeDayLabel(new Date("2026-10-25T12:00:00Z"), new Date("2026-10-24T12:00:00Z"))).toBe("demain");
  });
});
