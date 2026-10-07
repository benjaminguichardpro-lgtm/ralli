// Machine à états d'une rencontre : SEUL endroit où les transitions sont définies.
// Fonctions pures (l'heure courante est passée en paramètre).

import type { EncounterStatus } from "@/generated/prisma/enums";

/** Statut effectif : le statut stocké, plus LOCKED dérivé à la lecture. */
export type EffectiveStatus = EncounterStatus | "LOCKED";

export const STATUS_LABELS: Record<EffectiveStatus, string> = {
  DRAFT: "Brouillon",
  OPEN: "Pronostics ouverts",
  LOCKED: "Pronostics fermés",
  SCORE_PROPOSED: "Score proposé",
  DISPUTED: "Score contesté",
  CONFIRMED: "Terminée",
  CANCELLED: "Annulée",
};

/** LOCKED = OPEN stocké et heure de fermeture des pronostics atteinte. Aucun cron. */
export function effectiveStatus(
  e: { status: EncounterStatus; predictionsCloseAt: Date },
  now: Date,
): EffectiveStatus {
  if (e.status === "OPEN" && now.getTime() >= e.predictionsCloseAt.getTime()) return "LOCKED";
  return e.status;
}

export type EncounterAction = "publish" | "proposeScore" | "withdrawScore" | "confirmScore" | "disputeScore" | "resolveDispute" | "cancel";

/**
 * Liste exhaustive des transitions autorisées.
 * OPEN → LOCKED n'est pas une action : c'est le passage de l'heure (voir effectiveStatus).
 */
export const TRANSITIONS: readonly { action: EncounterAction; from: readonly EffectiveStatus[]; to: EncounterStatus }[] = [
  { action: "publish", from: ["DRAFT"], to: "OPEN" },
  { action: "proposeScore", from: ["LOCKED"], to: "SCORE_PROPOSED" },
  // Retrait d'une proposition par son auteur : retour à OPEN stocké, donc LOCKED à l'affichage (l'heure de fermeture est passée).
  { action: "withdrawScore", from: ["SCORE_PROPOSED"], to: "OPEN" },
  { action: "confirmScore", from: ["SCORE_PROPOSED"], to: "CONFIRMED" },
  { action: "disputeScore", from: ["SCORE_PROPOSED"], to: "DISPUTED" },
  { action: "resolveDispute", from: ["DISPUTED"], to: "CONFIRMED" },
  { action: "cancel", from: ["DRAFT", "OPEN", "LOCKED"], to: "CANCELLED" },
];

const ACTION_LABELS: Record<EncounterAction, string> = {
  publish: "publier",
  proposeScore: "proposer le score",
  withdrawScore: "retirer la proposition de score",
  confirmScore: "confirmer le score",
  disputeScore: "contester le score",
  resolveDispute: "trancher le litige",
  cancel: "annuler",
};

export class InvalidTransitionError extends Error {
  constructor(
    readonly action: EncounterAction,
    readonly from: EffectiveStatus,
  ) {
    const verb = ACTION_LABELS[action];
    const de = /^[aeiouyéèêh]/i.test(verb) ? "d'" : "de ";
    super(`Impossible ${de}${verb} : la rencontre est « ${STATUS_LABELS[from]} ».`);
    this.name = "InvalidTransitionError";
  }
}

/** Renvoie le statut cible ou lève InvalidTransitionError. */
export function nextStatus(action: EncounterAction, from: EffectiveStatus): EncounterStatus {
  const t = TRANSITIONS.find((x) => x.action === action);
  if (!t || !t.from.includes(from)) throw new InvalidTransitionError(action, from);
  return t.to;
}

// ─────────────── Modifications hors transition (décision R6) ───────────────

/** Composition (ajout, modification, retrait de match) : brouillon, ou publiée avant la fermeture des pronostics. */
export function canEditComposition(s: EffectiveStatus): boolean {
  return s === "DRAFT" || s === "OPEN";
}

/** Report de date : jusqu'à ce qu'un score soit proposé. */
export function canReschedule(s: EffectiveStatus): boolean {
  return s === "DRAFT" || s === "OPEN" || s === "LOCKED";
}

/** Suppression définitive : brouillon uniquement (rien n'en dépend). */
export function canDelete(s: EffectiveStatus): boolean {
  return s === "DRAFT";
}

/**
 * Nouvelle heure de fermeture des pronostics après un report.
 * Avant la fermeture : elle suit la nouvelle heure de début. Après : elle ne bouge plus
 * (on ne rouvre jamais des pronostics, le match a peut-être commencé).
 */
export function predictionsCloseAfterReschedule(
  e: { status: EncounterStatus; predictionsCloseAt: Date },
  newStartsAt: Date,
  now: Date,
): Date {
  return effectiveStatus(e, now) === "LOCKED" ? e.predictionsCloseAt : newStartsAt;
}
