import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { signInSchema } from "@/lib/validation/account";
import { authenticate } from "@/server/accounts";
import { clearLoginFailures, clientIp, loginWaitMs, recordLoginFailure } from "@/server/rate-limit";

declare module "next-auth" {
  interface Session {
    user: { id: string };
    // Instant (ms) où cette connexion a été ouverte ; 0 pour une connexion antérieure à cette information.
    loginAt: number;
  }
}

// Durée d'une connexion : 14 jours.
const SESSION_MAX_AGE = 14 * 24 * 60 * 60;

// Sessions JWT (imposé par le provider credentials). Le JWT ne porte que l'identifiant :
// pseudo, rôles et drapeau mustChangePassword sont relus en base à chaque requête.
export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE },
  // Un mauvais mot de passe est un cas normal : on ne le journalise pas comme une erreur serveur.
  logger: {
    error(error) {
      // `type` et non `name` : le nom de classe est minifié en production.
      if ("type" in error && error.type === "CredentialsSignin") return;
      console.error(error);
    },
  },
  pages: { signIn: "/connexion" },
  providers: [
    Credentials({
      credentials: { identifier: {}, password: {} },
      // La limite d'essais est vérifiée ici (et non seulement dans le formulaire) : cette fonction répond aussi aux appels directs à /api/auth.
      async authorize(raw, request) {
        const parsed = signInSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { identifier, password } = parsed.data;
        const ip = clientIp(request.headers);
        if ((await loginWaitMs(identifier, ip)) > 0) return null;
        const user = await authenticate(identifier, password);
        if (user) await clearLoginFailures(identifier);
        else await recordLoginFailure(identifier, ip);
        return user;
      },
    }),
  ],
  callbacks: {
    // loginAt est posé à la connexion et à la mise à jour demandée après un changement de mot de passe ;
    // il ne bouge pas quand Auth.js renouvelle le cookie (contrairement à `iat`).
    jwt({ token, user, trigger }) {
      if (user?.id) token.sub = user.id;
      if (user?.id || trigger === "update") token.loginAt = Date.now();
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      session.loginAt = typeof token.loginAt === "number" ? token.loginAt : 0;
      return session;
    },
  },
});
