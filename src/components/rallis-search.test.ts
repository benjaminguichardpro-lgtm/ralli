import { describe, expect, it } from "vitest";
import { suggest } from "./rallis-search";

const m = (label: string, detail: string) => ({ label, detail });
const all = [
  m("Élise Dupont contre Anna Roy", "TC Lyon · Dames 1 – TC Voisin 1"),
  m("Jean-Paul Martin contre Luc Petit", "TC Lyon · Messieurs 1 – TC Voisin 1"),
];

describe("suggestions de recherche", () => {
  it("propose le match entier dès les premières lettres d'un prénom, d'un nom ou d'un club", () => {
    expect(suggest(all, "eli")).toEqual([all[0]]);
    expect(suggest(all, "roy")).toEqual([all[0]]);
    expect(suggest(all, "pau")).toEqual([all[1]]);
    expect(suggest(all, "mess")).toEqual([all[1]]);
    expect(suggest(all, "lyon")).toEqual(all);
  });
  it("rien sans texte, ni au milieu d'un mot", () => {
    expect(suggest(all, "")).toEqual([]);
    expect(suggest(all, "ise")).toEqual([]);
  });
});
