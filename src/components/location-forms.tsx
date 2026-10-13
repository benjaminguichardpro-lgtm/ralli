"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { saveRadiusAction, savePostalCodeAction } from "@/app/actions/location";
import { initialFormState } from "@/app/actions/types";
import { MAX_RADIUS_KM, MIN_RADIUS_KM } from "@/lib/geo";
import { Field, FormMessage, SubmitButton } from "./ui";

/**
 * Code postal du compte (facultatif, privé). Sert au profil et à la fenêtre « Où es-tu ? ». Un champ vide efface le code.
 * `onSaved` est appelé une fois le code enregistré (la fenêtre l'utilise pour ouvrir les rencontres à proximité).
 */
export function PostalCodeForm({
  initial = "",
  commune = null,
  submitLabel = "Enregistrer",
  onSaved,
  className = "",
}: {
  initial?: string;
  commune?: string | null;
  submitLabel?: string;
  onSaved?: () => void;
  className?: string;
}) {
  const router = useRouter();
  const [state, action] = useActionState(savePostalCodeAction, initialFormState);
  useEffect(() => {
    if (!state.ok) return;
    if (onSaved && state.values?.postalCode) onSaved();
    else router.refresh(); // profil, ou code effacé : la page relit le compte
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form action={action} className={`space-y-3 ${className}`} noValidate data-testid="postal-code-form">
      <Field
        label="Code postal de ta ville"
        name="postalCode"
        inputMode="numeric"
        autoComplete="postal-code"
        maxLength={6}
        placeholder="69003"
        defaultValue={state.values?.postalCode ?? initial}
        error={state.errors?.postalCode}
        hint={commune ? `Commune : ${commune}. Laisse vide pour l'effacer.` : "Facultatif. Sert uniquement à te montrer les rencontres près de chez toi. Visible de toi seul."}
      />
      <FormMessage signal={state} ok={state.ok}>{state.ok ? state.message : undefined}</FormMessage>
      <SubmitButton pendingLabel="Vérification…">{submitLabel}</SubmitButton>
    </form>
  );
}

const RADIUS_APPLY_DELAY_MS = 500;

/**
 * Rayon de la recherche à proximité : un curseur de 1 à 200 km. Il s'applique tout seul une fois le curseur lâché
 * (court délai, pour ne pas enregistrer chaque cran pendant qu'on le glisse), puis la page relit le compte. Gardé dans le compte.
 */
export function RadiusForm({ radiusKm }: { radiusKm: number }) {
  const [state, action] = useActionState(saveRadiusAction, initialFormState);
  const form = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [value, setValue] = useState(radiusKm);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const change = (km: number) => {
    setValue(km);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => form.current?.requestSubmit(), RADIUS_APPLY_DELAY_MS);
  };
  return (
    <form ref={form} action={action} className="space-y-2" noValidate data-testid="radius-form">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor="nearby-radius" className="font-medium">
          Rayon de recherche
        </label>
        <output htmlFor="nearby-radius" className="font-data text-lg font-bold text-primary" data-testid="radius-value">
          {value} km
        </output>
      </div>
      <input
        id="nearby-radius"
        name="radius"
        type="range"
        min={MIN_RADIUS_KM}
        max={MAX_RADIUS_KM}
        step={1}
        value={value}
        onChange={(e) => change(Number(e.target.value))}
        aria-valuetext={`${value} kilomètres`}
        className="block h-11 w-full cursor-pointer accent-primary"
      />
      <div className="flex justify-between text-xs text-ink-muted" aria-hidden="true">
        <span>{MIN_RADIUS_KM} km</span>
        <span>100 km</span>
        <span>{MAX_RADIUS_KM} km</span>
      </div>
      <p className="text-sm text-ink-muted">À vol d&apos;oiseau, depuis le centre de ta commune.</p>
      {/* Pas de « Rayon enregistré » : le titre des résultats suit le curseur. On n'affiche qu'une erreur. */}
      <FormMessage signal={state} ok={state.ok}>{state.ok ? undefined : state.message}</FormMessage>
    </form>
  );
}
