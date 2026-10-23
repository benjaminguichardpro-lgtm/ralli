import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { signInSchema } from "@/lib/validation/account";
import { authenticate } from "@/server/accounts";
import { clearLoginFailures, clientIp, loginWaitMs, recordLoginFailure } from "@/server/rate-limit";

declare module "next-auth" {
  interface Session {
    user: { id: string };
  }
}

// Sessions JWT (imposé par le provider credentials). Le JWT ne porte que l'identifiant :
// pseudo, rôles et drapeau mustChangePassword sont relus en base à chaque requête.
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
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
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
