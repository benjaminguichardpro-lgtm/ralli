import { z } from "zod";
import { findForbiddenWords } from "./vocabulary";

// Rallis gagnants en story (tranche 28) : règles pures. Un ralli gagné et réglé se partage au club en une carte automatique
// (une seule par ralli) pendant 7 jours après le règlement ; un commentaire facultatif de 140 caractères l'accompagne.

export const WIN_COMMENT_MAX = 140;
export const WIN_SHARE_WINDOW_DAYS = 7;
export const WIN_SHARE_WINDOW_MS = WIN_SHARE_WINDOW_DAYS * 24 * 3_600_000;
export const REPORT_REASON_MAX = 200;
export const WIN_REACTION = "🎾";
export const WINS_RING_LABEL = "Rallis gagnants";

export const winCommentSchema = z
  .string()
  .trim()
  .max(WIN_COMMENT_MAX, { error: `Au plus ${WIN_COMMENT_MAX} caractères` })
  .refine((t) => findForbiddenWords(t).length === 0, {
    error: "Ce texte contient un mot interdit dans Ralli (pari, mise, bookmaker, euro). Reformule-le.",
  });

export const reportReasonSchema = z
  .string()
  .trim()
  .max(REPORT_REASON_MAX, { error: `Au plus ${REPORT_REASON_MAX} caractères` })
  .transform((s) => (s === "" ? null : s));

export type ShareState = "can" | "shared" | "closed" | "no";

type ShareInput = {
  status: "PENDING" | "WON" | "LOST" | "REFUNDED";
  settledAt: Date | null;
  encounterConfirmed: boolean;
  alreadyShared: boolean;
  /** Membre du club organisateur : sans cela personne ne verrait la carte. */
  isMember: boolean;
};

/**
 * Où en est le partage d'un ralli :
 * - `can` : gagné, réglé, rencontre confirmée, dans les 7 jours, pas encore partagé ;
 * - `shared` : une carte (non supprimée) existe déjà ;
 * - `closed` : gagné mais le délai de 7 jours est passé, la rencontre n'est pas confirmée ou la personne a quitté le club ;
 * - `no` : ni gagné ni réglé (perdu, remboursé, en cours) : pas de bouton.
 */
export function shareState(r: ShareInput, now: Date): ShareState {
  if (r.status !== "WON" || !r.settledAt) return "no";
  if (r.alreadyShared) return "shared";
  if (!r.encounterConfirmed || !r.isMember) return "closed";
  const age = now.getTime() - r.settledAt.getTime();
  return age >= 0 && age <= WIN_SHARE_WINDOW_MS ? "can" : "closed";
}

/** Message du bouton WhatsApp : « J'ai gagné 340 Aces sur Léa M. contre Sara T. avec Ralli ! » (le lien est ajouté par le bouton). */
export function whatsappText(payoutAces: number, matchLabel: string): string {
  return `J'ai gagné ${payoutAces.toLocaleString("fr-FR")} Aces sur ${matchLabel} avec Ralli !`;
}

/** Texte lu par les lecteurs d'écran pour une carte : tout ce que la carte montre. */
export function winCardSummary(c: { author: string; matchLabel: string; pickedName: string; committedAces: number; odds: string; payoutAces: number }): string {
  const aces = (n: number) => n.toLocaleString("fr-FR");
  return `${c.author} a gagné ${aces(c.payoutAces)} Aces : ${c.matchLabel}, ralli sur ${c.pickedName} à la cote ${c.odds}, ${aces(c.committedAces)} Aces engagés.`;
}
