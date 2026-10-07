/** Nom public d'un joueur : « Prénom N. » (décision 23 : jamais le nom complet sur la page publique). */
export function publicPlayerName(firstName: string, lastName: string): string {
  const initial = lastName.trim().match(/\p{L}/u)?.[0]?.toLocaleUpperCase("fr-FR");
  return initial ? `${firstName.trim()} ${initial}.` : firstName.trim();
}
