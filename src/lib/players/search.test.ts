import { describe, expect, it } from "vitest";
import { filterPlayers } from "./search";

const p = (firstName: string, lastName: string, rankLabel: string, teams: string[] = []) => ({ firstName, lastName, rankLabel, teams: teams.map((name) => ({ name })) });
const players = [p("Hugo", "Lefèvre", "15/4", ["Messieurs 1"]), p("Léa", "Martin", "30/1", ["Dames 1"]), p("Thomas", "Bernard", "NC"), p("Camille", "Dupont", "30/1", ["Dames 1", "Messieurs 2"])];
const names = (q: string) => filterPlayers(players, q).map((x) => x.lastName);

describe("recherche de joueur", () => {
  it("sans accents ni casse, par prénom ou par nom", () => {
    expect(names("lefevre")).toEqual(["Lefèvre"]);
    expect(names("LEA")).toEqual(["Martin"]);
    expect(names("thomas")).toEqual(["Bernard"]);
    expect(names("ber")).toEqual(["Bernard"]); // début de mot
  });

  it("tous les mots doivent correspondre, dans n'importe quel ordre", () => {
    expect(names("martin léa")).toEqual(["Martin"]);
    expect(names("hugo martin")).toEqual([]);
  });

  it("trouve aussi par classement ou par équipe", () => {
    expect(names("30/1")).toEqual(["Martin", "Dupont"]);
    expect(names("messieurs 2")).toEqual(["Dupont"]);
    expect(names("dames")).toEqual(["Martin", "Dupont"]);
  });

  it("une recherche vide ou faite d'espaces garde tout ; aucun résultat : liste vide", () => {
    expect(names("")).toHaveLength(4);
    expect(names("   ")).toHaveLength(4);
    expect(names("zzz")).toEqual([]);
  });
});
