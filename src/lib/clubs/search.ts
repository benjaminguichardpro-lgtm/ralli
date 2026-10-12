/** Texte sans accents ni majuscules, pour comparer « Évian », « evian » et « ÉVIAN ». */
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/\s+/g, " ")
    .trim();
}

/** Un club correspond à la recherche si chaque mot saisi se retrouve dans son nom, sa ville ou son code postal. */
export function clubMatchesQuery(club: { name: string; city: string | null; postalCode: string | null }, query: string): boolean {
  const words = normalizeSearch(query).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalizeSearch([club.name, club.city ?? "", club.postalCode ?? ""].join(" "));
  return words.every((w) => haystack.includes(w));
}
