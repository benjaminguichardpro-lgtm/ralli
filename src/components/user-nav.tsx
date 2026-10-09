import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getBalance } from "@/server/ledger";
import { Avatar } from "./avatar";
import { BalancePill } from "./balance-pill";

export async function UserNav() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <Link href="/connexion" className="inline-flex min-h-11 items-center px-2 font-semibold underline">
        Connexion
      </Link>
    );
  }
  const balance = user.mustChangePassword ? null : await getBalance(user.id);
  return (
    <div className="flex items-center gap-4">
      {balance !== null && <BalancePill initial={balance} />}
      {/* Le pseudo n'est plus affiché : il reste dans le DOM (lecteurs d'écran) et sur la page du profil. */}
      <Link
        href="/profil"
        aria-label="Mon profil"
        className="inline-flex size-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
      >
        <Avatar user={user} size={44} className="border-2 border-gold" />
        <span data-testid="nav-user" className="sr-only">
          {user.displayName}
        </span>
      </Link>
    </div>
  );
}
