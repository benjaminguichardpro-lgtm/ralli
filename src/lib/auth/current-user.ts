import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export type CurrentUser = { id: string; displayName: string; mustChangePassword: boolean };

/** Utilisateur connecté, relu en base (null si pas de session ou compte disparu). */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  // Rendu à la requête : Auth.js re-chiffre le cookie de session (aléa crypto), interdit pendant le prerender.
  await connection();
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  return db.user.findUnique({
    where: { id },
    select: { id: true, displayName: true, mustChangePassword: true },
  });
}

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
