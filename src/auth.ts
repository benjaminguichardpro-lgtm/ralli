import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { signInSchema } from "@/lib/validation/account";
import { authenticate } from "@/server/accounts";

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
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = signInSchema.safeParse(raw);
        if (!parsed.success) return null;
        return authenticate(parsed.data.email, parsed.data.password);
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
