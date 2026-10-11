import type { PredictionStatus } from "@/generated/prisma/enums";

/** Phrase d'état d'un pronostic, sans vocabulaire interdit. */
export function predictionSideLabel(status: PredictionStatus, payoutAces: number | null): string {
  switch (status) {
    case "PENDING":
      return "En attente du résultat.";
    case "WON":
      return `Gagné : ${(payoutAces ?? 0).toLocaleString("fr-FR")} Aces.`;
    case "LOST":
      return "Perdu.";
    case "REFUNDED":
      return "Remboursé.";
  }
}

/** Nombre de membres qui ont pronostiqué un match : « 1 membre a pronostiqué », « 12 membres ont pronostiqué ». Rien à 0. */
export function predictorCountLabel(n: number): string | null {
  if (n <= 0) return null;
  return n === 1 ? "1 membre a pronostiqué" : `${n.toLocaleString("fr-FR")} membres ont pronostiqué`;
}
