"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { placePredictionAction } from "@/app/actions/predictions";
import { initialFormState } from "@/app/actions/types";
import type { PredictionStatus, Side } from "@/generated/prisma/enums";
import { MIN_COMMITTED_ACES, computePayout } from "@/lib/predictions/payout";
import { predictionSideLabel } from "@/lib/predictions/labels";
import { WhatsAppShare } from "./share-link";
import { SubmitButton } from "./ui";

export type Pick = { name: string; rank: string; oddsX100: number | null; odds: string | null };
export type Mine = { side: Side; committedAces: number; odds: string; status: PredictionStatus; payoutAces: number | null };

/** Ce que le lecteur peut faire sur ce match. */
export type Access =
  | { kind: "predict"; balance: number }
  /** `explainOnTouch` : toucher une cote ouvre une fenêtre qui donne la raison (pronostic impossible pour ce compte). */
  | { kind: "note"; text: string; testId?: string; explainOnTouch?: boolean }
  | { kind: "login" }
  | { kind: "none" };

const QUICK = [50, 100, 250] as const;
const aces = (n: number) => n.toLocaleString("fr-FR");

const odd = "grid min-h-14 grid-cols-[1fr_auto] items-center gap-x-2 rounded-xl border-2 border-primary px-3 py-1.5 text-left";
const oddBase = `${odd} bg-surface text-primary`;
const oddOn = `${odd} bg-primary text-on-primary`;

function OddsFace({ pick, on, onClay }: { pick: Pick; on?: boolean; onClay?: boolean }) {
  return (
    <>
      <span className="font-semibold leading-tight">
        {pick.name}
        <span className={`block text-xs font-medium ${onClay ? "" : on ? "text-on-primary-soft" : "text-ink-muted"}`}>{pick.rank}</span>
      </span>
      {pick.odds && (
        <span data-testid={onClay ? undefined : "odds"} className={`font-data text-xl font-bold ${on && !onClay ? "text-gold" : ""}`}>
          {pick.odds}
        </span>
      )}
    </>
  );
}

const FILL_MS = 350;

/**
 * Case d'un joueur à toucher. Au toucher, elle se remplit de gauche à droite de terre battue (le texte devient blanc
 * au fur et à mesure grâce à une seconde couche rognée), puis le panneau de pronostic s'ouvre. Elle reste remplie
 * tant que le panneau est ouvert et se vide à sa fermeture.
 */
function OddButton({
  pick,
  label,
  phase,
  onTouch,
  onFilled,
}: {
  pick: Pick;
  label: string;
  phase: "idle" | "filling" | "open";
  onTouch: () => void;
  onFilled: () => void;
}) {
  const filled = phase !== "idle";
  return (
    <button
      type="button"
      onClick={onTouch}
      aria-label={label}
      data-fill={phase}
      className={`${oddBase} relative cursor-pointer overflow-hidden transition-colors duration-[350ms] motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
        filled ? "!border-clay" : ""
      }`}
    >
      <OddsFace pick={pick} />
      <span
        aria-hidden="true"
        data-testid="clay-fill"
        className="absolute inset-0 grid grid-cols-[1fr_auto] items-center gap-x-2 bg-clay px-3 py-1.5 text-on-clay transition-[clip-path] duration-[350ms] ease-out motion-reduce:transition-none"
        style={{ clipPath: filled ? "inset(0 0 0 0)" : "inset(0 100% 0 0)" }}
        onTransitionEnd={(e) => {
          if (e.propertyName === "clip-path" && phase === "filling") onFilled();
        }}
      >
        <OddsFace pick={pick} onClay />
      </span>
    </button>
  );
}

/**
 * Les deux joueurs d'un simple avec leur cote. Selon le lecteur : boutons à toucher (panneau de pronostic),
 * pronostic déjà fait, ou simple affichage. `share` décrit la rencontre pour le message WhatsApp.
 */
export function MatchPicks({
  matchId,
  home,
  away,
  access,
  mine,
  share,
}: {
  matchId: string;
  home: Pick;
  away: Pick;
  access: Access;
  mine: Mine | null;
  share: { title: string; whenLabel: string; path: string };
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [side, setSide] = useState<Side>("HOME");
  const [amount, setAmount] = useState("");
  const [state, action] = useActionState(placePredictionAction, initialFormState);
  // Remplissage terre battue de la case touchée, avant l'ouverture du panneau.
  const [fill, setFill] = useState<{ side: Side; phase: "filling" | "open" } | null>(null);

  useEffect(() => {
    if (state.ok) dialog.current?.close();
  }, [state.ok]);

  const openSheet = () => {
    if (!dialog.current || dialog.current.open) return;
    setFill((f) => f && { ...f, phase: "open" });
    dialog.current.showModal();
  };

  // Filet de sécurité : si la transition ne se termine pas (onglet masqué…), le panneau s'ouvre quand même.
  useEffect(() => {
    if (fill?.phase !== "filling") return;
    const t = window.setTimeout(openSheet, FILL_MS + 350);
    return () => window.clearTimeout(t);
  });

  const picks = { HOME: home, AWAY: away } as const;
  const hasOdds = home.odds !== null && away.odds !== null;

  if (!hasOdds) {
    return (
      <div className="space-y-1">
        {[home, away].map((p) => (
          <p key={p.name + p.rank}>
            <span className="font-medium">{p.name}</span> <span className="text-sm text-ink-muted">({p.rank})</span>
          </p>
        ))}
      </div>
    );
  }

  const interactive = access.kind === "predict" && !mine;
  // Compte qui ne peut pas pronostiquer (admin, capitaine, joueur aligné) : toucher une cote explique pourquoi.
  const explain = access.kind === "note" && access.explainOnTouch === true;

  if (mine) {
    const pickedName = picks[mine.side].name;
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2.5">
          <div className={mine.side === "HOME" ? oddOn : oddBase}>
            <OddsFace pick={home} on={mine.side === "HOME"} />
          </div>
          <div className={mine.side === "AWAY" ? oddOn : oddBase}>
            <OddsFace pick={away} on={mine.side === "AWAY"} />
          </div>
        </div>
        <p data-testid="my-prediction" className="rounded-lg bg-pale p-3 text-sm">
          Votre pronostic : <strong>{pickedName}</strong>, {aces(mine.committedAces)} Aces engagés à la cote {mine.odds}.{" "}
          {predictionSideLabel(mine.status, mine.payoutAces)}
        </p>
        <WhatsAppShare
          text={`Je pronostique ${pickedName} à ${mine.odds} sur ${share.title} (${share.whenLabel}) 🎾`}
          path={share.path}
          label="Partager mon pronostic"
        />
      </div>
    );
  }

  const touch = (s: Side) => {
    if (fill) return; // déjà en cours : on ignore les doubles touchers
    setSide(s);
    // « Réduire les animations » : pas de remplissage progressif, la case est pleine et le panneau s'ouvre tout de suite.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setFill({ side: s, phase: "open" });
      dialog.current?.showModal();
      return;
    }
    setFill({ side: s, phase: "filling" });
  };

  const value = Number(amount);
  const balance = access.kind === "predict" ? access.balance : 0;
  const valid = Number.isSafeInteger(value) && value >= MIN_COMMITTED_ACES && value <= balance;
  const picked = picks[side];
  const hint =
    amount === "" || valid
      ? null
      : !Number.isSafeInteger(value) || value < MIN_COMMITTED_ACES
        ? `Minimum ${MIN_COMMITTED_ACES} Aces, en nombre entier`
        : `Solde insuffisant : vous avez ${aces(balance)} Aces`;
  const win = valid && picked.oddsX100 ? computePayout(value, picked.oddsX100) : null;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2.5" data-testid={interactive ? "predict" : undefined}>
        {(["HOME", "AWAY"] as const).map((s) =>
          interactive ? (
            <OddButton
              key={s}
              pick={picks[s]}
              label={`${picks[s].name} gagne, cote ${picks[s].odds}`}
              phase={fill?.side === s ? fill.phase : "idle"}
              onTouch={() => touch(s)}
              onFilled={openSheet}
            />
          ) : explain ? (
            <button
              key={s}
              type="button"
              onClick={() => dialog.current?.showModal()}
              aria-haspopup="dialog"
              aria-label={`${picks[s].name}, cote ${picks[s].odds} : pronostic impossible, touche pour savoir pourquoi`}
              data-testid="blocked-odd"
              className={`${oddBase} cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}
            >
              <OddsFace pick={picks[s]} />
            </button>
          ) : (
            <div key={s} className={oddBase}>
              <OddsFace pick={picks[s]} />
            </div>
          ),
        )}
      </div>

      {access.kind === "login" && (
        <p className="text-sm text-ink-muted">
          <Link href="/connexion" className="font-semibold text-primary underline">
            Connectez-vous
          </Link>{" "}
          pour pronostiquer.
        </p>
      )}
      {access.kind === "note" && (
        <p className="text-sm text-ink-muted" data-testid={access.testId}>
          {access.text}
        </p>
      )}

      {explain && access.kind === "note" && (
        <dialog
          ref={dialog}
          className="sheet"
          aria-label="Pronostic impossible"
          data-testid="blocked-dialog"
          onClick={(e) => e.target === dialog.current && dialog.current?.close()}
        >
          <div className="mx-auto grid w-full max-w-xl gap-4 rounded-t-3xl bg-primary-dark px-5 pb-6 pt-3 text-center text-on-primary">
            <div className="mx-auto h-1 w-10 rounded-full bg-on-primary-soft opacity-60" aria-hidden="true" />
            <p className="text-xs font-bold uppercase tracking-widest text-on-primary-soft">Pronostic impossible</p>
            <p className="font-serif text-2xl font-semibold leading-snug" data-testid="blocked-dialog-text">
              {access.text}
            </p>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-gold px-4 font-semibold text-on-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            >
              J&apos;ai compris
            </button>
          </div>
        </dialog>
      )}

      {interactive && (
        <dialog
          ref={dialog}
          className="sheet"
          aria-label="Votre pronostic"
          onClick={(e) => e.target === dialog.current && dialog.current?.close()}
          onClose={() => setFill(null)}
        >
          <form action={action} className="mx-auto grid w-full max-w-xl gap-4 rounded-t-3xl bg-primary-dark px-5 pb-6 pt-3 text-on-primary" noValidate>
            <input type="hidden" name="matchId" value={matchId} />
            <input type="hidden" name="side" value={side} />
            <div className="mx-auto h-1 w-10 rounded-full bg-on-primary-soft opacity-60" aria-hidden="true" />
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-on-primary-soft">Votre choix</p>
                <p className="font-serif text-2xl font-semibold leading-tight">{picked.name} gagne</p>
              </div>
              <p className="font-data text-3xl font-bold text-gold" data-testid="sheet-odds">
                {picked.odds}
              </p>
            </div>

            <div className="grid grid-cols-4 gap-2" role="group" aria-label="Montants rapides">
              {[...QUICK, "all" as const].map((q) => {
                const v = q === "all" ? balance : q;
                const on = amount !== "" && value === v;
                const off = v > balance || v < MIN_COMMITTED_ACES;
                return (
                  <button
                    key={q}
                    type="button"
                    disabled={off}
                    onClick={() => setAmount(String(v))}
                    aria-pressed={on}
                    className={`font-data min-h-12 rounded-xl border-2 text-base font-bold disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${
                      on ? "border-gold bg-gold text-on-gold" : "border-on-primary-soft bg-transparent text-on-primary"
                    }`}
                  >
                    {q === "all" ? "Tout" : q}
                  </button>
                );
              })}
            </div>

            <div className="grid gap-1">
              <label htmlFor={`amt-${matchId}`} className="text-sm font-semibold text-on-primary-soft">
                Aces engagés
              </label>
              <input
                id={`amt-${matchId}`}
                name="committedAces"
                type="number"
                inputMode="numeric"
                min={MIN_COMMITTED_ACES}
                max={balance}
                step={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Un autre montant"
                className="font-data min-h-12 w-full rounded-xl border-2 border-on-primary-soft bg-primary px-3 text-lg font-semibold text-on-primary placeholder:text-on-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
              />
              {hint && (
                <p role="alert" className="text-sm font-semibold text-gold">
                  {hint}
                </p>
              )}
            </div>

            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-t border-on-primary-soft/35 pt-3 text-[0.9375rem]">
              <dt className="text-on-primary-soft">Aces engagés</dt>
              <dd className="font-data text-right font-bold" data-testid="recap-committed">
                {valid ? aces(value) : "—"}
              </dd>
              <dt className="text-on-primary-soft">Aces gagnés si vous avez raison</dt>
              <dd className="font-data text-right text-lg font-bold text-gold" data-testid="recap-win">
                {win !== null ? aces(win) : "—"}
              </dd>
              <dt className="text-on-primary-soft">Solde après validation</dt>
              <dd className="font-data text-right font-bold" data-testid="recap-balance">
                {valid ? aces(balance - value) : "—"}
              </dd>
            </dl>

            <p className="text-sm text-on-primary-soft">Un pronostic est définitif une fois validé. Minimum {MIN_COMMITTED_ACES} Aces.</p>
            {state.message && !state.ok && (
              <div role="alert" className="rounded-lg border-l-4 border-gold bg-primary p-3 font-medium">
                {state.message}
              </div>
            )}
            <SubmitButton
              variant="gold"
              className="w-full"
              pendingLabel="Validation…"
              disabled={!valid}
            >
              Valider mon ralli
            </SubmitButton>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="min-h-11 font-semibold text-on-primary underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            >
              Annuler
            </button>
          </form>
        </dialog>
      )}
    </div>
  );
}
