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
