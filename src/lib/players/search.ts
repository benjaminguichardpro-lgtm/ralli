// Recherche d'un joueur dans la liste du club : chaque mot tapé doit se retrouver (sans accents ni casse) dans le prénom, le nom,
// le classement ou le nom d'une équipe. « lef bern » trouve « Hugo Lefèvre » seulement s'il a aussi « bern » quelque part. Fonctions pures.

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

type Searchable = { firstName: string; lastName: string; rankLabel: string; teams: { name: string }[] };

/** Joueurs dont les prénom, nom, classement ou équipes contiennent tous les mots de `query` ; une recherche vide garde tout. */
export function filterPlayers<T extends Searchable>(players: readonly T[], query: string): T[] {
  const words = fold(query).split(" ").filter(Boolean);
  if (words.length === 0) return [...players];
  return players.filter((p) => {
    const haystack = fold(`${p.firstName} ${p.lastName} ${p.lastName} ${p.firstName} ${p.rankLabel} ${p.teams.map((t) => t.name).join(" ")}`);
    return words.every((w) => haystack.includes(w));
  });
}
