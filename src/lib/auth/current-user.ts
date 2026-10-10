import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export type CurrentUser = { id: string; displayName: string; mustChangePassword: boolean; avatarKey: string; avatarPhotoAt: Date | null; onboardingSeenAt: Date | null };

/**
 * Utilisateur connecté, relu en base (null si pas de session ou compte disparu).
 * Calculé une seule fois par requête (l'en-tête, la barre du bas et la page l'appellent tous) :
 * les lectures parallèles de la session se sont montrées instables, et c'est trois fois moins de requêtes.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // Rendu à la requête : Auth.js re-chiffre le cookie de session (aléa crypto), interdit pendant le prerender.
  await connection();
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  return db.user.findUnique({
    where: { id },
    select: { id: true, displayName: true, mustChangePassword: true, avatarKey: true, avatarPhotoAt: true, onboardingSeenAt: true },
  });
});

/**
 * Exige une session. Redirige vers la connexion sinon, et vers le changement de
 * mot de passe tant qu'un mot de passe temporaire est actif.
 */
export async function requireUser(opts: { allowPendingPasswordChange?: boolean } = {}): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");
  if (user.mustChangePassword && !opts.allowPendingPasswordChange) redirect("/mot-de-passe");
  return user;
}
