/** Nom d'un joueur : « Prénom Nom » partout (décision de Benjamin, 2026-10-20 : remplace l'ancienne forme abrégée avec l'initiale du nom). */
export function publicPlayerName(firstName: string, lastName: string): string {
  return [firstName, lastName].map((part) => part.trim()).filter(Boolean).join(" ");
}
