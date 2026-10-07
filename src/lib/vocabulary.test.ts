import { describe, expect, it } from "vitest";
import { findForbiddenWords } from "./vocabulary";

const words = (t: string) => findForbiddenWords(t).map((h) => h.match);

describe("findForbiddenWords", () => {
  it.each([
    "Faites votre pari",
    "Vos paris du jour",
    "Pariez sur le favori",
    "Les parieurs du club",
    "Votre mise",
    "Les mises sont closes",
    "Miser 100 Aces",
    "Aces mis en jeu via une mise en jeu",
    "Le bookmaker",
    "Gain en euros",
    "10 €",
    "PARIS SPORTIFS",
  ])("détecte un mot interdit : %s", (text) => {
    expect(findForbiddenWords(text).length).toBeGreaterThan(0);
  });

  it.each([
    "Dernière mise à jour : il y a 2 min",
    "Mise en place de la rencontre",
    "Mise en forme du tableau",
    "Mise en avant du club",
    "Remise des prix",
    "La misère du 30/1",
    "Comparer les cotes",
    "Fuseau Europe/Paris",
    "TC Paris 15",
    "Aces engagés : 100, Aces gagnés : 156, cote 1,56",
    "Pronostic validé",
    "Jeu gratuit, sans argent réel, réservé aux 18 ans et plus.",
  ])("ne signale pas de faux positif : %s", (text) => {
    expect(words(text)).toEqual([]);
  });

  it("renvoie chaque occurrence avec sa position", () => {
    const hits = findForbiddenWords("pari puis mise");
    expect(hits.map((h) => [h.word, h.index])).toEqual([
      ["pari", 0],
      ["mise", 10],
    ]);
  });
});
