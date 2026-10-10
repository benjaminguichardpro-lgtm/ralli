"use client";

import { useActionState, useRef } from "react";
import { resetMemberAvatarAction, setAvatarPresetAction, uploadAvatarAction } from "@/app/actions/profile";
import { initialFormState } from "@/app/actions/types";
import { AVATARS, PHOTO_MAX_BYTES } from "@/lib/avatars";
import { FormMessage, SubmitButton, confirmOnSubmit } from "./ui";

/** Grille des avatars prédéfinis : un bouton par avatar, l'avatar actuel est marqué (bordure et coche, pas seulement la couleur). */
export function AvatarPicker({ current }: { current: string | null }) {
  const [state, action] = useActionState(setAvatarPresetAction, initialFormState);
  return (
    <form action={action} className="space-y-3" data-testid="avatar-picker">
      <ul className="grid grid-cols-4 gap-3">
        {AVATARS.map((a) => {
          const on = a.key === current;
          return (
            <li key={a.key}>
              <button
                type="submit"
                name="avatarKey"
                value={a.key}
                aria-label={a.label}
                aria-pressed={on}
                className={`relative block aspect-square w-full min-h-11 overflow-hidden rounded-full border-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                  on ? "border-primary" : "border-transparent"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/avatar/${a.key}.svg`} alt="" className="size-full object-cover" />
                {on && (
                  <span aria-hidden="true" className="absolute bottom-0 right-0 grid size-5 place-items-center rounded-full bg-primary text-xs text-on-primary">
                    ✓
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <FormMessage signal={state} ok={state.ok}>{state.message}</FormMessage>
    </form>
  );
}

/**
 * Bouton « Importer une photo » : il ouvre le choix de fichier, et la photo part dès qu'elle est choisie (pas de second clic).
 * Le champ fichier reste dans le DOM, masqué : les lecteurs d'écran et les tests passent par le bouton.
 */
export function PhotoUploadButton() {
  const [state, action, pending] = useActionState(uploadAvatarAction, initialFormState);
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  return (
    <form ref={form} action={action} className="flex w-full flex-col items-center gap-2" data-testid="photo-upload">
      <input
        ref={input}
        type="file"
        name="photo"
        accept="image/jpeg,image/png,image/webp"
        tabIndex={-1}
        aria-hidden="true"
        className="hidden"
        data-testid="photo-input"
        onChange={(e) => e.currentTarget.files?.length && form.current?.requestSubmit()}
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => input.current?.click()}
        className="inline-flex min-h-11 items-center justify-center rounded-lg border border-primary bg-surface px-5 font-semibold text-primary transition-opacity disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {pending ? "Envoi…" : "Importer une photo"}
      </button>
      <p className="text-center text-sm text-ink-muted">JPG, PNG ou WebP, {PHOTO_MAX_BYTES / 1024 / 1024} Mo au maximum. Recadrée au centre, en carré.</p>
      <FormMessage signal={state} ok={state.ok}>{state.message}</FormMessage>
    </form>
  );
}

/** Pour les admins : remet l'avatar par défaut d'un membre (photo inappropriée). */
export function ResetAvatarForm({ clubId, userId, displayName }: { clubId: string; userId: string; displayName: string }) {
  const [state, action] = useActionState(resetMemberAvatarAction, initialFormState);
  return (
    <form
      action={action}
      onSubmit={confirmOnSubmit(`Retirer la photo de ${displayName} et remettre un avatar par défaut ?`)}
      className="inline-flex items-center"
    >
      <input type="hidden" name="clubId" value={clubId} />
      <input type="hidden" name="userId" value={userId} />
      <SubmitButton variant="ghost" className="text-sm" pendingLabel="…">
        Retirer la photo
      </SubmitButton>
      {state.message && !state.ok && <FormMessage signal={state} ok={state.ok}>{state.message}</FormMessage>}
    </form>
  );
}
