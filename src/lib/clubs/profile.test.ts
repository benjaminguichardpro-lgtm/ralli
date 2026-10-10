import { describe, expect, it } from "vitest";
import { clubInitials, clubProfileSchema, formatAddress, formatCount, isProfileEmpty, logoSrc, websiteLabel, websiteSchema } from "./profile";

const blank = { name: "TC Test", foundedYear: "", licenseeCount: "", address: "", postalCode: "", city: "", websiteUrl: "", description: "", indoorCourts: "", outdoorCourts: "" };
const parse = (over: Partial<typeof blank>) => clubProfileSchema(2026).safeParse({ ...blank, ...over });

describe("fiche du club : validation", () => {
  it("accepte une fiche entièrement vide (seul le nom compte) et transforme les champs vides en null", () => {
    const r = parse({});
    expect(r.success && r.data).toEqual({
      name: "TC Test", foundedYear: null, licenseeCount: null, address: null, postalCode: null, city: null,
      websiteUrl: null, description: null, indoorCourts: null, outdoorCourts: null,
    });
  });

  it("accepte une fiche complète", () => {
    const r = parse({ foundedYear: "1974", licenseeCount: "250", address: " 12 rue des Lilas ", postalCode: "69003", city: "Lyon", websiteUrl: "https://www.tclyon.fr", description: "Un club", indoorCourts: "2", outdoorCourts: "6" });
    expect(r.success && r.data).toMatchObject({ foundedYear: 1974, licenseeCount: 250, address: "12 rue des Lilas", indoorCourts: 2, outdoorCourts: 6, websiteUrl: "https://www.tclyon.fr" });
  });

  it("refuse une année hors de 1800 à l'année en cours, ou mal écrite", () => {
    for (const y of ["1799", "2027", "74", "abcd", "19 74"]) expect(parse({ foundedYear: y }).success, y).toBe(false);
    expect(parse({ foundedYear: "2026" }).success).toBe(true);
    expect(parse({ foundedYear: "1800" }).success).toBe(true);
  });

  it("refuse les nombres négatifs, décimaux, trop grands ou non numériques", () => {
    for (const n of ["-1", "2.5", "10001", "dix", "1e3"]) expect(parse({ licenseeCount: n }).success, n).toBe(false);
    for (const n of ["101", "-3", "x"]) {
      expect(parse({ indoorCourts: n }).success, n).toBe(false);
      expect(parse({ outdoorCourts: n }).success, n).toBe(false);
    }
    expect(parse({ licenseeCount: "0", indoorCourts: "0" }).success).toBe(true);
    expect(parse({ licenseeCount: "10000", outdoorCourts: "100" }).success).toBe(true);
  });

  it("refuse un nom trop court et des textes trop longs", () => {
    expect(parse({ name: "A" }).success).toBe(false);
    expect(parse({ description: "x".repeat(501) }).success).toBe(false);
    expect(parse({ description: "x".repeat(500) }).success).toBe(true);
    expect(parse({ address: "x".repeat(201) }).success).toBe(false);
    expect(parse({ city: "x".repeat(101) }).success).toBe(false);
  });
});

describe("site web : http:// ou https:// uniquement", () => {
  it("accepte http et https, refuse tout le reste", () => {
    for (const ok of ["https://www.monclub.fr", "http://monclub.fr/accueil", "HTTPS://Monclub.fr"]) expect(websiteSchema.safeParse(ok).success, ok).toBe(true);
    for (const bad of ["www.monclub.fr", "monclub.fr", "javascript:alert(1)", "data:text/html,<b>x</b>", "ftp://monclub.fr", "https://", "https://localhost", "https://a b.fr", "https://user:pw@monclub.fr", "//monclub.fr"]) {
      expect(websiteSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
  it("vide = pas de site", () => {
    expect(websiteSchema.parse("  ")).toBeNull();
  });
  it("refuse plus de 300 caractères", () => {
    expect(websiteSchema.safeParse(`https://monclub.fr/${"a".repeat(300)}`).success).toBe(false);
  });
  it("libellé du lien sans https://, www. ni barre finale", () => {
    expect(websiteLabel("https://www.monclub.fr/")).toBe("monclub.fr");
    expect(websiteLabel("http://monclub.fr/club")).toBe("monclub.fr/club");
  });
});

describe("pastille et affichage", () => {
  it("initiales : sigle conservé, sinon deux premières lettres, connecteurs ignorés", () => {
    expect(clubInitials("TC Démo-Lyon")).toBe("TC");
    expect(clubInitials("Tennis Club de Lyon")).toBe("TC");
    expect(clubInitials("Roland")).toBe("R");
    expect(clubInitials("ASPTT Nantes")).toBe("ASP");
    expect(clubInitials("  ")).toBe("?");
    expect(clubInitials("élan tennis")).toBe("ÉT");
  });
  it("adresse avec ce qui est renseigné", () => {
    expect(formatAddress({ address: "12 rue des Lilas", postalCode: "69003", city: "Lyon" })).toBe("12 rue des Lilas, 69003 Lyon");
    expect(formatAddress({ address: null, postalCode: null, city: "Lyon" })).toBe("Lyon");
    expect(formatAddress({ address: "12 rue des Lilas", postalCode: null, city: null })).toBe("12 rue des Lilas");
    expect(formatAddress({ address: null, postalCode: null, city: null })).toBeNull();
  });
  it("logo : adresse avec la date, null sans logo", () => {
    expect(logoSrc({ id: "c1", logoUpdatedAt: null })).toBeNull();
    expect(logoSrc({ id: "c1", logoUpdatedAt: new Date(5000) })).toBe("/api/club-logo/c1?v=5000");
  });
  it("nombres avec séparateur de milliers", () => {
    expect(formatCount(1250).replace(/\s/g, " ")).toBe("1 250");
    expect(formatCount(80)).toBe("80");
  });
  it("fiche vide tant que rien n'est rempli, logo compris", () => {
    const empty = { foundedYear: null, licenseeCount: null, address: null, postalCode: null, city: null, websiteUrl: null, description: null, indoorCourts: null, outdoorCourts: null, logoUpdatedAt: null };
    expect(isProfileEmpty(empty)).toBe(true);
    expect(isProfileEmpty({ ...empty, city: "Lyon" })).toBe(false);
    expect(isProfileEmpty({ ...empty, logoUpdatedAt: new Date() })).toBe(false);
    expect(isProfileEmpty({ ...empty, indoorCourts: 0 })).toBe(false); // 0 est une valeur renseignée
  });
});
