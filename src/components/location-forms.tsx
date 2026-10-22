"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { savePostalCodeAction } from "@/app/actions/location";
import { initialFormState } from "@/app/actions/types";
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
        hint={commune ? `Commune : ${commune}. Laisse vide pour l'effacer.` : "Facultatif. Sert uniquement à te montrer les interclubs et les tournois près de chez toi. Visible de toi seul."}
      />
      <FormMessage signal={state} ok={state.ok}>{state.ok ? state.message : undefined}</FormMessage>
      <SubmitButton pendingLabel="Vérification…">{submitLabel}</SubmitButton>
    </form>
  );
}
