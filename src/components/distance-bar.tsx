"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { saveRadiusAction } from "@/app/actions/location";
import { initialFormState } from "@/app/actions/types";
import { SLIDER_MAX, radiusFromSlider, radiusLabel, sliderFromRadius } from "@/lib/geo";
import { FormMessage } from "./ui";

// Barre de distance, sous les onglets « Interclubs à venir » et « Tournoi à venir » de l'accueil (et sur la page « Interclub à proximité ») :
// des raccourcis à toucher, un grand curseur pour le réglage précis, la valeur en gros, et le nombre de résultats. Elle s'applique toute
// seule (les raccourcis tout de suite, le curseur 0,5 s après qu'on l'a lâché), puis la page relit le compte. Pas de bouton à valider.

const APPLY_DELAY_MS = 500;
const SHORTCUTS = [0, 10, 30, 50, 100, 999] as const;
const shortcutLabel = (km: number) => (km === 0 ? "Mes clubs" : km === 999 ? "France" : `${km} km`);

export function DistanceBar({
  radiusKm,
  kind,
  scope,
  count,
  noun,
}: {
  radiusKm: number;
  kind: "interclubs" | "tournois";
  /** Titre de la zone cherchée (« À moins de 30 km de Lyon », « Mes clubs »). */
  scope: string;
  /** Nombre de résultats avec ce réglage ; null quand il n'y en a pas (code postal manquant). */
  count: number | null;
  /** « interclub » ou « tournoi » : accordé au nombre. */
  noun: string;
}) {
  const [state, action, pending] = useActionState(saveRadiusAction, initialFormState);
  const form = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [position, setPosition] = useState(sliderFromRadius(radiusKm));
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const km = radiusFromSlider(position);

  // Le formulaire lit `radius` dans un champ caché : on laisse React le mettre à jour avant d'envoyer.
  const apply = (p: number, delay: number) => {
    setPosition(p);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => form.current?.requestSubmit(), delay);
  };
  const id = `radius-${kind}`;
  const fill = `${(position / SLIDER_MAX) * 100}%`;
  return (
    <form ref={form} action={action} className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm" noValidate data-testid="radius-form">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="radius" value={km} />

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <label htmlFor={id} className="block text-sm font-medium text-ink-muted">
            Distance
          </label>
          <output htmlFor={id} className="block font-serif text-3xl font-semibold leading-none text-primary" data-testid="radius-value">
            {radiusLabel(km)}
          </output>
        </div>
        <p className="shrink-0 pb-0.5 text-right text-sm font-semibold text-ink" aria-live="polite" data-testid="radius-count">
          {pending ? "Mise à jour…" : count === null ? "" : `${count} ${noun}${count > 1 ? "s" : ""}`}
        </p>
      </div>

      <input
        id={id}
        type="range"
        min={0}
        max={SLIDER_MAX}
        step={1}
        value={position}
        onChange={(e) => apply(Number(e.target.value), APPLY_DELAY_MS)}
        aria-label="Distance de recherche"
        aria-valuetext={radiusLabel(km)}
        className="range-ux block w-full cursor-pointer"
        style={{ "--fill": fill } as React.CSSProperties}
      />

      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Distances rapides">
        {SHORTCUTS.map((s) => {
          const on = km === s;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={on}
              onClick={() => apply(sliderFromRadius(s), 0)}
              data-testid={`radius-chip-${s}`}
              className={`inline-flex min-h-11 w-full items-center justify-center rounded-full border px-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                on ? "border-primary bg-primary text-on-primary" : "border-line bg-surface text-primary"
              }`}
            >
              {shortcutLabel(s)}
            </button>
          );
        })}
      </div>

      <p className="text-sm text-ink-muted" data-testid="radius-scope">
        {scope} · à vol d&apos;oiseau, depuis le centre de ta commune.
      </p>
      {/* Pas de « Distance enregistrée » : le titre et le compteur suivent la barre. On n'affiche qu'une erreur. */}
      <FormMessage signal={state} ok={state.ok}>{state.ok ? undefined : state.message}</FormMessage>
    </form>
  );
}
