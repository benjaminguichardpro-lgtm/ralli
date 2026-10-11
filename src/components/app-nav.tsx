import { getCurrentUser } from "@/lib/auth/current-user";
import { listMyClubs } from "@/server/clubs";
import { hasUnseenResults } from "@/server/onboarding";
import { TabBar } from "./tab-bar";

/** Barre du bas : seulement pour un compte connecté. Avec un seul club, « Club » et « Classement » y mènent directement. */
export async function AppNav() {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return null;
  const [clubs, newResults] = await Promise.all([listMyClubs(user.id), hasUnseenResults(user.id)]);
  const only = clubs.length === 1 ? clubs[0]!.id : null;
  return (
    <TabBar
      hrefs={{
        matchs: "/",
        rallis: "/rallis",
        classement: only ? `/clubs/${only}/classement` : "/classement",
        club: only ? `/clubs/${only}` : "/clubs",
      }}
      badges={{ rallis: newResults }}
    />
  );
}
