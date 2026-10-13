import { describe, expect, it } from "vitest";
import { freeSlug, slugSchema, slugify } from "./slug";

describe("slugify", () => {
  it("retire accents, majuscules et signes", () => {
    expect(slugify("TC Démo-Lyon")).toBe("tc-demo-lyon");
    expect(slugify("  Tennis Club d'Évian !! ")).toBe("tennis-club-d-evian");
  });
  it("reste dans 3 à 50 caractères et ne finit pas par un tiret", () => {
    expect(slugify("A")).toBe("club-a");
    expect(slugify("!!")).toBe("club");
    expect(slugify("x".repeat(80))).toHaveLength(50);
    expect(slugify(`${"a".repeat(49)} b`)).toBe("a".repeat(49));
    expect(slugSchema.safeParse(slugify("A")).success).toBe(true);
  });
});

describe("freeSlug", () => {
  it("ajoute -2, -3 quand l'adresse est prise", async () => {
    const taken = new Set(["tc-lyon", "tc-lyon-2"]);
    expect(await freeSlug("tc-lyon", async (s) => taken.has(s))).toBe("tc-lyon-3");
    expect(await freeSlug("tc-nice", async (s) => taken.has(s))).toBe("tc-nice");
  });
  it("saute les mots réservés", async () => {
    expect(await freeSlug("admin", async () => false)).toBe("admin-2");
  });
  it("garde le suffixe dans les 50 caractères", async () => {
    const long = "a".repeat(50);
    const r = await freeSlug(long, async (s) => s === long);
    expect(r).toHaveLength(50);
    expect(r.endsWith("-2")).toBe(true);
  });
});

describe("slugSchema", () => {
  it("accepte une adresse correcte, mise en minuscules", () => {
    expect(slugSchema.parse(" TC-Lyon ")).toBe("tc-lyon");
  });
  it.each(["ab", "-tc", "tc-", "tc--lyon", "tc lyon", "tc_lyon", "é-tc", "api", "a".repeat(51)])("refuse %s", (s) => {
    expect(slugSchema.safeParse(s).success).toBe(false);
  });
});
