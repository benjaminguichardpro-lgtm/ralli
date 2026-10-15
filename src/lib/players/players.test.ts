import { describe, expect, it } from "vitest";
import { ageFrom, formatBirth, parseBirthDate } from "./birth";
import { parseCsv } from "./csv";
import { IMPORT_TEMPLATE, normalizeSheet, tidyName } from "./import";
import { parseFftRank } from "./rank";

const NOW = new Date("2026-10-14T12:00:00Z");

describe("classement FFT", () => {
  it.each([
    ["NC", "NC"], ["nc", "NC"], ["N.C.", "NC"], ["non classé", "NC"], ["40", "R40"],
    ["30/5", "R30_5"], ["30.5", "R30_5"], ["30-5", "R30_5"], ["30 / 1", "R30_1"], ["30", "R30"], [30, "R30"], [30.5, "R30_5"],
    ["15/4", "R15_4"], ["15", "R15"], ["5/6", "R5_6"], ["4/6", "R4_6"], ["1/6", "R1_6"], ["0", "R0"], ["-2/6", "RM2_6"], ["−4/6", "RM4_6"], ["-15", "RM15"], ["-30", "RM30"],
    ["1re série", "PREMIERE_SERIE"], ["1ère série", "PREMIERE_SERIE"], ["Première série", "PREMIERE_SERIE"], ["classement : 15/2", "R15_2"],
  ])("lit %s", (raw, expected) => {
    expect(parseFftRank(raw)).toBe(expected);
  });

  it("une cellule Excel « 30/5 » transformée en date (30 mai) est relue comme 30/5", () => {
    expect(parseFftRank(new Date(Date.UTC(2026, 4, 30)))).toBe("R30_5");
    expect(parseFftRank(new Date(Date.UTC(2026, 5, 5)))).toBe("R5_6");
  });

  it.each(["", "abc", "30/9", "6/6", "50", "2e série", "15/0", null, undefined])("refuse %s", (raw) => {
    expect(parseFftRank(raw)).toBeNull();
  });
});

describe("date de naissance et âge", () => {
  it("formats usuels, année seule, objet Date d'Excel", () => {
    expect(parseBirthDate("14/03/1987", NOW)).toEqual({ date: new Date("1987-03-14T00:00:00Z"), yearOnly: false });
    expect(parseBirthDate("14-03-1987", NOW)).toMatchObject({ date: new Date("1987-03-14T00:00:00Z") });
    expect(parseBirthDate("1987-03-14", NOW)).toMatchObject({ date: new Date("1987-03-14T00:00:00Z") });
    expect(parseBirthDate("1987", NOW)).toEqual({ date: new Date("1987-01-01T00:00:00Z"), yearOnly: true });
    expect(parseBirthDate(new Date("1987-03-14T00:00:00Z"), NOW)).toMatchObject({ date: new Date("1987-03-14T00:00:00Z") });
    expect(parseBirthDate("", NOW)).toEqual({ date: null, yearOnly: false });
    expect(parseBirthDate(undefined, NOW)).toEqual({ date: null, yearOnly: false });
  });

  it("refuse les dates impossibles, futures ou avant 1900", () => {
    for (const bad of ["31/02/1990", "12/13/1990", "demain", "01/01/2030", "01/01/1850"]) expect(parseBirthDate(bad, NOW)).toHaveProperty("error");
  });

  it("âge en années révolues, avant et après l'anniversaire", () => {
    const born = new Date("1987-03-14T00:00:00Z");
    expect(ageFrom(born, new Date("2026-03-13T12:00:00Z"))).toBe(38);
    expect(ageFrom(born, new Date("2026-03-14T12:00:00Z"))).toBe(39);
    expect(formatBirth(born)).toBe("14/03/1987");
  });
});

describe("CSV", () => {
  it("détecte « ; » « , » et tabulation, gère guillemets et BOM", () => {
    expect(parseCsv("a;b;c\r\n1;2;3")).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
    expect(parseCsv("a,b,c\n1,2,3\n")).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
    expect(parseCsv("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseCsv('﻿nom;prénom\n"Dupont; fils";"Jean ""JP"""')).toEqual([["nom", "prénom"], ["Dupont; fils", 'Jean "JP"']]);
  });
});

describe("lecture du tableau d'import", () => {
  it("repère les colonnes par leur titre (ordre libre, accents et casse ignorés) et nettoie les lignes", () => {
    const data = [
      ["Liste des joueurs 2026"], // ligne parasite avant les titres
      ["CLASSEMENT", "Prénom", "NOM", "Né le"],
      ["30/2", "camille", "DUPONT", "14/03/1987"],
      ["", "Jean-Pierre", "MARTIN-DURAND", ""],
      [null, null, null, null],
      ["abc", "Léa", "Bernard", "31/02/2000"],
    ];
    const { rows, fatal } = normalizeSheet(data, NOW);
    expect(fatal).toBeNull();
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ line: 3, firstName: "camille", lastName: "Dupont", fftRank: "R30_2", errors: [] });
    expect(rows[0]!.birthDate).toEqual(new Date("1987-03-14T00:00:00Z"));
    expect(rows[1]).toMatchObject({ line: 4, firstName: "Jean-Pierre", lastName: "Martin-Durand", fftRank: "NC", birthDate: null });
    expect(rows[1]!.notes).toContain("Classement absent : NC");
    expect(rows[2]!.errors).toEqual(expect.arrayContaining([expect.stringContaining("Classement inconnu"), "Date de naissance inexistante"]));
  });

  it("refuse un fichier sans les colonnes Nom et Prénom, ou vide, ou trop long", () => {
    expect(normalizeSheet([["a", "b"], ["1", "2"]]).fatal).toContain("Titres de colonnes introuvables");
    expect(normalizeSheet([["Nom", "Prénom"]]).fatal).toContain("aucun joueur");
    const big = [["Nom", "Prénom"], ...Array.from({ length: 10_001 }, (_, i) => [`N${i}`, "P"])];
    expect(normalizeSheet(big).fatal).toContain("Trop de lignes");
  });

  it("signale un nom invalide sans bloquer les autres lignes", () => {
    const { rows } = normalizeSheet([["Nom", "Prénom"], ["Dupont", "Camille"], ["123", "X"], ["", "Sans nom"]], NOW);
    expect(rows.map((r) => r.errors.length > 0)).toEqual([false, true, true]);
  });

  it("noms en capitales rendus lisibles", () => {
    expect(tidyName("DUPONT")).toBe("Dupont");
    expect(tidyName("JEAN-PIERRE")).toBe("Jean-Pierre");
    expect(tidyName("O'NEILL")).toBe("O'Neill");
    expect(tidyName("de la Fontaine")).toBe("de la Fontaine");
    expect(tidyName("X")).toBe("X");
  });

  it("le modèle à télécharger est lui-même importable sans erreur", () => {
    const { rows, fatal } = normalizeSheet(parseCsv(IMPORT_TEMPLATE), NOW);
    expect(fatal).toBeNull();
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.errors.length === 0)).toBe(true);
    expect(rows[2]).toMatchObject({ lastName: "Bernard", fftRank: "R15_4" });
  });
});
