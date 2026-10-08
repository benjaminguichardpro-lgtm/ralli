"use client";

import { useEffect, useRef, useState } from "react";
import { claimDailyBonusAction } from "@/app/actions/wallet";
import type { DailyBonusResult } from "@/server/daily-bonus";

type Claimed = Extract<DailyBonusResult, { claimed: true }>;

const aces = (n: number) => n.toLocaleString("fr-FR");

/**
 * Popup « Connexion quotidienne X/7 » : à l'ouverture de l'app, demande le bonus du jour au serveur
 * (une seule fois par jour, le serveur tranche) et l'affiche s'il vient d'être crédité.
 */
export function DailyBonusPopup() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [bonus, setBonus] = useState<Claimed | null>(null);

  // Un seul appel par affichage : en développement, React lance chaque effet deux fois, et le second appel
  // verrait « déjà reçu » alors que la réponse du premier (le vrai bonus) aurait été jetée.
  const asked = useRef(false);

  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    void claimDailyBonusAction().then((r) => {
      if (r.claimed) setBonus(r);
    });
  }, []);

  useEffect(() => {
    if (bonus && !dialog.current?.open) dialog.current?.showModal();
  }, [bonus]);

  if (!bonus) return null;
  const left = bonus.length - bonus.position;
  return (
    <dialog
      ref={dialog}
      className="sheet"
      aria-label={`Connexion quotidienne ${bonus.position} sur ${bonus.length}`}
      data-testid="daily-bonus"
      onClick={(e) => e.target === dialog.current && dialog.current?.close()}
    >
      <div className="mx-auto grid w-full max-w-xl gap-4 rounded-t-3xl bg-primary-dark px-5 pb-6 pt-3 text-center text-on-primary">
        <div className="mx-auto h-1 w-10 rounded-full bg-on-primary-soft opacity-60" aria-hidden="true" />
        <p className="text-xs font-bold uppercase tracking-widest text-on-primary-soft">Connexion quotidienne</p>
        <p className="font-serif text-4xl font-semibold" data-testid="daily-position">
          {bonus.position}/{bonus.length}
        </p>
        <ol className="mx-auto flex gap-2" aria-hidden="true">
          {Array.from({ length: bonus.length }, (_, i) => (
            <li
              key={i}
              className={`size-8 rounded-full border-2 ${
                i + 1 < bonus.position
                  ? "border-gold bg-gold/30"
                  : i + 1 === bonus.position
                    ? "border-gold bg-gold"
                    : "border-on-primary-soft/60"
              }`}
            />
          ))}
        </ol>
        <p className="font-figures text-5xl font-bold text-gold" data-testid="daily-total">
          +{aces(bonus.total)} Aces
        </p>
        {bonus.streakBonus > 0 ? (
          <p className="text-on-primary-soft" data-testid="daily-detail">
            {aces(bonus.dailyAmount)} Aces de connexion et {aces(bonus.streakBonus)} Aces de bonus pour {bonus.length} jours d&apos;affilée. Bravo !
          </p>
        ) : (
          <p className="text-on-primary-soft" data-testid="daily-detail">
            Revenez demain : encore {left} jour{left > 1 ? "s" : ""} avant le bonus de 50 Aces.
          </p>
        )}
        <p className="text-sm text-on-primary-soft">
          Nouveau solde : <strong className="font-data text-on-primary">{aces(bonus.balance)} Aces</strong>
        </p>
        <button
          type="button"
          onClick={() => dialog.current?.close()}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-gold px-4 font-semibold text-on-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
        >
          Super
        </button>
      </div>
    </dialog>
  );
}
