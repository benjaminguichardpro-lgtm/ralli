"use server";

import { refresh } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { type DailyBonusResult, claimDailyBonus } from "@/server/daily-bonus";
import { getBalance } from "@/server/ledger";

/** Solde actuel du compte connecté (null si personne n'est connecté). Sert à garder le solde de l'en-tête à jour. */
export async function currentBalanceAction(): Promise<number | null> {
  const user = await getCurrentUser();
  return user ? getBalance(user.id) : null;
}

/**
 * Bonus de connexion du jour, appelé à l'ouverture de l'app par un compte connecté (voir DailyBonusPopup).
 * Sans effet s'il a déjà été reçu aujourd'hui ou si le compte vient d'être créé.
 */
export async function claimDailyBonusAction(): Promise<DailyBonusResult> {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return { claimed: false };
  const result = await claimDailyBonus(user.id);
  if (result.claimed) refresh(); // le solde de l'en-tête suit
  return result;
}
