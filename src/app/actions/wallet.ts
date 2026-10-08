"use server";

import { getCurrentUser } from "@/lib/auth/current-user";
import { getBalance } from "@/server/ledger";

/** Solde actuel du compte connecté (null si personne n'est connecté). Sert à garder le solde de l'en-tête à jour. */
export async function currentBalanceAction(): Promise<number | null> {
  const user = await getCurrentUser();
  return user ? getBalance(user.id) : null;
}
