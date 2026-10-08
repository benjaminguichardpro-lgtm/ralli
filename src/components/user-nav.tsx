import Link from "next/link";
import { signOutAction } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getBalance } from "@/server/ledger";
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
    <div className="flex items-center gap-2">
      {balance !== null && <BalancePill initial={balance} />}
      <span data-testid="nav-user" className="max-w-20 truncate text-sm">
        {user.displayName}
      </span>
      <form action={signOutAction}>
        <button type="submit" className="inline-flex min-h-11 items-center px-2 text-sm font-semibold underline">
          Déconnexion
        </button>
      </form>
    </div>
  );
}
