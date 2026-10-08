import { describe, expect, it } from "vitest";
import { previousDay, streakFor } from "./streak";

describe("previousDay", () => {
  it.each([
    ["2026-10-12", "2026-10-11"],
    ["2026-10-01", "2026-09-30"],
    ["2027-01-01", "2026-12-31"],
    ["2028-03-01", "2028-02-29"], // année bissextile
    ["2026-10-26", "2026-10-25"], // jour de changement d'heure : aucun effet
  ])("%s → %s", (day, prev) => expect(previousDay(day)).toBe(prev));
});

describe("streakFor", () => {
  const consecutive = (end: string, n: number) => {
    const out: string[] = [];
    for (let d = end, i = 0; i < n; d = previousDay(d), i++) out.push(d);
    return out;
  };

  it("première connexion : série de 1, position 1/7, pas de bonus de série", () => {
    expect(streakFor("2026-10-12", [])).toEqual({ streak: 1, position: 1, completesStreak: false });
  });

  it("jours consécutifs : la position avance, le bonus de série tombe au 7e jour", () => {
    for (let n = 1; n <= 7; n++) {
      const r = streakFor("2026-10-12", consecutive("2026-10-11", n - 1));
      expect(r).toEqual({ streak: n, position: n, completesStreak: n === 7 });
    }
  });

  it("un jour manqué remet la série à 1", () => {
    // récompensé il y a 2 jours, 3 jours, 4 jours… mais pas hier
    expect(streakFor("2026-10-12", consecutive("2026-10-10", 5)).streak).toBe(1);
    expect(streakFor("2026-10-12", ["2026-10-09"]).position).toBe(1);
  });

  it("la série recommence à 1/7 le lendemain du 7e jour, et le bonus revient aux jours 14 et 21", () => {
    expect(streakFor("2026-10-12", consecutive("2026-10-11", 7))).toEqual({ streak: 8, position: 1, completesStreak: false });
    expect(streakFor("2026-10-12", consecutive("2026-10-11", 13))).toEqual({ streak: 14, position: 7, completesStreak: true });
    expect(streakFor("2026-10-12", consecutive("2026-10-11", 20))).toEqual({ streak: 21, position: 7, completesStreak: true });
  });

  it("ignore l'ordre des jours, les doublons et les jours futurs ou déjà passés au-delà d'un trou", () => {
    expect(streakFor("2026-10-12", ["2026-10-09", "2026-10-11", "2026-10-10", "2026-10-11", "2026-10-13"]).streak).toBe(4);
  });

  it("traverse les fins de mois et d'année", () => {
    expect(streakFor("2027-01-02", ["2027-01-01", "2026-12-31", "2026-12-30"]).streak).toBe(4);
  });
});
