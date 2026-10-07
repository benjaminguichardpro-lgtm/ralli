import { describe, expect, it } from "vitest";
import { createEncounterSchema, parisDateTimeSchema } from "./encounter";

const msg = (r: { success: boolean; error?: { issues: { message: string }[] } }) => r.error?.issues[0]?.message;

describe("parisDateTimeSchema", () => {
  it("vide → « requises », mal formée → « invalides », inexistante → message dédié", () => {
    expect(msg(parisDateTimeSchema.safeParse(""))).toBe("Date et heure requises");
    expect(msg(parisDateTimeSchema.safeParse(undefined))).toBe("Date et heure requises");
    expect(msg(parisDateTimeSchema.safeParse("demain"))).toBe("Date et heure invalides");
    expect(msg(parisDateTimeSchema.safeParse("2026-03-29T02:30"))).toBe("Cette heure n'existe pas (passage à l'heure d'été)");
  });

  it("convertit l'heure de Paris en UTC", () => {
    expect(parisDateTimeSchema.parse("2027-03-14T14:00").toISOString()).toBe("2027-03-14T13:00:00.000Z");
  });
});

describe("createEncounterSchema", () => {
  it("adversaire et lieu obligatoires", () => {
    const r = createEncounterSchema.safeParse({ clubTeamId: "t1", opponentTeamId: "", venue: "", startsAt: "2027-03-14T14:00" });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path[0])).toEqual(["opponentTeamId", "venue"]);
  });
});
