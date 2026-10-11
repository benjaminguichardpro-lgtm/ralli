"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
  const shown = useCountUp(balance);

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
      <span data-testid="balance" data-balance={balance} className="font-data">
        {shown.toLocaleString("fr-FR")} Aces
      </span>
    </Link>
  );
}

const COUNT_UP_MS = 600;

/**
 * Valeur affichée du solde : elle « compte » jusqu'à la nouvelle valeur en 0,6 s quand le solde change (ralli validé, gain, bonus).
 * Pas d'animation au premier affichage, ni avec « réduire les animations » : la valeur est alors changée tout de suite.
 */
function useCountUp(target: number): number {
  const [shown, setShown] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    const from = current.current;
    if (from === target) return;
    // « Réduire les animations » : durée nulle, la valeur change dès la première image.
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : COUNT_UP_MS;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = duration === 0 ? 1 : Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3; // ralentit vers la fin
      current.current = t === 1 ? target : Math.round(from + (target - from) * eased);
      setShown(current.current);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return shown;
}
