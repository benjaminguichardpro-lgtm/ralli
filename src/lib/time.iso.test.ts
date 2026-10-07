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
