"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { markResultsSeenAction } from "@/app/actions/onboarding";
import type { ResultsRecap } from "@/server/onboarding";

const aces = (n: number) => n.toLocaleString("fr-FR");
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

const STATUS_TEXT = {
  WON: (a: number) => `Gagné : +${aces(a)} Aces`,
  LOST: () => "Perdu",
  REFUNDED: (a: number) => `Remboursé : ${aces(a)} Aces`,
} as const;

/** Pluie d'or : décor en CSS seulement, masqué avec « réduire les animations ». */
function GoldRain() {
  return (
    <div className="gold-rain" aria-hidden="true">
      {Array.from({ length: 18 }, (_, i) => (
        <span key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 6) * 120}ms`, animationDuration: `${1400 + (i % 5) * 250}ms` }} />
      ))}
    </div>
  );
}

/** Récapitulatif des pronostics réglés depuis la dernière visite. À la fermeture, ils sont marqués « vus ». */
export function ResultsRecapDialog({ recap }: { recap: ResultsRecap }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  const judged = recap.won + recap.lost;
  const winning = recap.wonAces > 0;
  return (
    <dialog
      ref={dialog}
      className="sheet"
      aria-label="Résultats de tes pronostics"
      data-testid="results-recap"
      onClose={() => void markResultsSeenAction(recap.cutoff)}
      onClick={(e) => e.target === dialog.current && dialog.current?.close()}
    >
      <div className="relative mx-auto grid max-h-[85dvh] w-full max-w-xl gap-4 overflow-y-auto rounded-t-3xl bg-primary-dark px-5 pb-6 pt-3 text-center text-on-primary">
        {winning && <GoldRain />}
        <div className="mx-auto h-1 w-10 rounded-full bg-on-primary-soft opacity-60" aria-hidden="true" />
        <p className="text-xs font-bold uppercase tracking-widest text-on-primary-soft">Résultats de tes pronostics</p>
        {winning ? (
          <p className="font-figures text-5xl font-bold text-gold" data-testid="recap-total">
            +{aces(recap.wonAces)} Aces
          </p>
        ) : (
          <p className="font-serif text-3xl font-semibold" data-testid="recap-total">
            {judged > 0 ? "Pas cette fois" : "Tes Aces te sont rendus"}
          </p>
        )}
        <p className="text-on-primary-soft" data-testid="recap-summary">
          {judged > 0
            ? winning
              ? `${plural(recap.won, "pronostic")} juste${recap.won > 1 ? "s" : ""} sur ${judged}. Bravo !`
              : "Aucun pronostic juste sur cette rencontre. La prochaine sera la bonne."
            : "Les matchs n'ont pas eu lieu ou ont changé : tes Aces engagés sont remboursés."}
          {recap.refunded > 0 && judged > 0 && ` ${plural(recap.refunded, "pronostic")} remboursé${recap.refunded > 1 ? "s" : ""}.`}
        </p>

        <ul className="grid gap-3 text-left">
          {recap.encounters.map((e) => (
            <li key={e.encounterId} className="rounded-2xl bg-brand p-3">
              <Link href={`/rencontres/${e.encounterId}`} className="font-serif text-lg font-semibold text-on-primary underline" onClick={() => dialog.current?.close()}>
                {e.title}
              </Link>
              <ul className="mt-1 divide-y divide-on-primary-soft/30">
                {e.items.map((p) => (
                  <li key={p.id} className="py-2 text-sm" data-status={p.status}>
                    <span className="block text-on-primary-soft">
                      {p.matchLabel} · tu avais choisi {p.pickedName} ({aces(p.committedAces)} Aces engagés)
                    </span>
                    <span className={`block font-semibold ${p.status === "WON" ? "text-gold" : "text-on-primary"}`}>
                      {STATUS_TEXT[p.status](p.payoutAces)}
                    </span>
                    {p.canShare && (
                      <Link href={`/rallis?partage=${p.id}`} data-testid="recap-share" className="mt-1 inline-flex min-h-11 items-center font-semibold text-gold underline" onClick={() => dialog.current?.close()}>
                        Partager ma victoire
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => dialog.current?.close()}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-gold px-4 font-semibold text-on-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
        >
          {winning ? "Super" : "Continuer"}
        </button>
      </div>
    </dialog>
  );
}
