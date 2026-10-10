"use server";

import { refresh } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { markOnboardingSeen, markResultsSeen } from "@/server/onboarding";

/** Le guide du premier lancement est terminé ou passé : la fenêtre suivante peut s'afficher. */
export async function markOnboardingSeenAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  await markOnboardingSeen(user.id);
  refresh();
}

/** Le récapitulatif a été vu jusqu'à `cutoff` (date ISO renvoyée par le serveur avec le récapitulatif). */
export async function markResultsSeenAction(cutoff: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const date = new Date(cutoff);
  try {
    await markResultsSeen(user.id, date);
  } catch {
    // Date invalide : rien n'est marqué, le récapitulatif reviendra.
    return;
  }
  refresh();
}
