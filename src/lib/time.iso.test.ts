import { describe, expect, it } from "vitest";
import { isoWeekKey } from "./time";

describe("isoWeekKey (heure de Paris)", () => {
  it.each([
    ["2026-10-12T06:00:00Z", "2026-W42"], // lundi
    ["2026-10-11T21:59:00Z", "2026-W41"], // dimanche 23:59 à Paris
    ["2026-10-11T22:00:00Z", "2026-W42"], // lundi 00:00 à Paris
    ["2026-01-01T12:00:00Z", "2026-W01"],
    ["2027-01-01T12:00:00Z", "2026-W53"], // vendredi : appartient à la dernière semaine 2026
    ["2024-12-30T12:00:00Z", "2025-W01"], // lundi : semaine 1 de 2025
  ])("%s → %s", (iso, key) => {
    expect(isoWeekKey(new Date(iso))).toBe(key);
  });
});

import { parisWeekBounds } from "./time";

describe("parisWeekBounds (lundi 00:00 → lundi suivant, heure de Paris)", () => {
  const iso = (d: Date) => d.toISOString();
  it("un mercredi d'automne (UTC+2)", () => {
    const w = parisWeekBounds(new Date("2026-10-14T10:00:00Z"));
    expect(iso(w.start)).toBe("2026-10-11T22:00:00.000Z");
    expect(iso(w.end)).toBe("2026-10-18T22:00:00.000Z");
  });
  it("dimanche 23:59 reste dans la semaine, lundi 00:00 ouvre la suivante", () => {
    expect(iso(parisWeekBounds(new Date("2026-10-11T21:59:00Z")).start)).toBe("2026-10-04T22:00:00.000Z");
    expect(iso(parisWeekBounds(new Date("2026-10-11T22:00:00Z")).start)).toBe("2026-10-11T22:00:00.000Z");
  });
  it("une semaine contenant le passage à l'heure d'hiver (25 octobre 2026)", () => {
    const w = parisWeekBounds(new Date("2026-10-24T12:00:00Z"));
    expect(iso(w.start)).toBe("2026-10-18T22:00:00.000Z"); // lundi 19 octobre 00:00 (UTC+2)
    expect(iso(w.end)).toBe("2026-10-25T23:00:00.000Z"); // lundi 26 octobre 00:00 (UTC+1)
    expect(w.end.getTime() - w.start.getTime()).toBe(169 * 3_600_000);
  });
  it("à cheval sur le nouvel an", () => {
    const w = parisWeekBounds(new Date("2026-12-31T12:00:00Z"));
    expect(iso(w.start)).toBe("2026-12-27T23:00:00.000Z"); // lundi 28 décembre 00:00 (UTC+1)
    expect(iso(w.end)).toBe("2027-01-03T23:00:00.000Z");
  });
});
