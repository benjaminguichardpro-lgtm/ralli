"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { currentBalanceAction } from "@/app/actions/wallet";

/**
 * Solde toujours visible en haut. L'en-tête n'est pas rechargé à chaque changement de page :
 * on relit donc le solde à chaque navigation, et on reprend la valeur du serveur quand elle change.
 */
export function BalancePill({ initial }: { initial: number }) {
  // Valeur relue après une navigation, valable tant que le serveur n'a pas fourni un nouveau solde de départ.
  const [fetched, setFetched] = useState<{ basis: number; value: number } | null>(null);
  const balance = fetched && fetched.basis === initial ? fetched.value : initial;
  const pathname = usePathname();

  useEffect(() => {
    let live = true;
    void currentBalanceAction().then((b) => {
      if (live && b !== null) setFetched({ basis: initial, value: b });
    });
    return () => {
      live = false;
    };
  }, [pathname, initial]);

  return (
    <Link
      href="/rallis"
      aria-label="Mes rallis et mon solde"
      data-tour="solde"
      className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full bg-primary-dark px-4 text-[0.9375rem] font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
    >
      <span aria-hidden="true" className="size-3.5 rounded-full bg-gold" />
      <span data-testid="balance" className="font-data">
        {balance.toLocaleString("fr-FR")} Aces
      </span>
    </Link>
  );
}
