/** Nom d'un joueur : « Prénom Nom » partout (décision de Benjamin, 2026-10-20 : remplace l'ancienne forme abrégée avec l'initiale du nom). */
export function publicPlayerName(firstName: string, lastName: string): string {
  return [firstName, lastName].map((part) => part.trim()).filter(Boolean).join(" ");
}

/** Visiteur sans compte (décision de Benjamin, 2026-10-25) : « Prénom N. » seulement, jamais le nom de famille en entier. */
export function visitorPlayerName(firstName: string, lastName: string): string {
  const initial = Array.from(lastName.trim())[0];
  return [firstName.trim(), initial ? `${initial.toLocaleUpperCase("fr-FR")}.` : ""].filter(Boolean).join(" ");
}
