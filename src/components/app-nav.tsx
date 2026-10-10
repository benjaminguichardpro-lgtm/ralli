import { getCurrentUser } from "@/lib/auth/current-user";
import { listMyClubs } from "@/server/clubs";
import { TabBar } from "./tab-bar";

/** Barre du bas : seulement pour un compte connecté. Avec un seul club, « Club » et « Classement » y mènent directement. */
export async function AppNav() {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return null;
  const clubs = await listMyClubs(user.id);
  const only = clubs.length === 1 ? clubs[0]!.id : null;
  return (
    <TabBar
      hrefs={{
        matchs: "/",
        resultats: "/resultats",
        classement: only ? `/clubs/${only}/classement` : "/classement",
        portefeuille: "/portefeuille",
        club: only ? `/clubs/${only}` : "/clubs",
      }}
    />
  );
}
