"use client";

import { type ReactNode, useActionState, useEffect, useRef, useState } from "react";
import { removeClubLogoAction, updateClubProfileAction, uploadClubLogoAction } from "@/app/actions/club-profile";
import { initialFormState } from "@/app/actions/types";
import { PHOTO_MAX_BYTES } from "@/lib/avatars";
import { ADDRESS_MAX, CITY_MAX, COURTS_MAX, DESCRIPTION_MAX, LICENSEES_MAX, POSTAL_CODE_MAX, WEBSITE_MAX } from "@/lib/clubs/profile";
import { Field, FieldError, FormMessage, SubmitButton, confirmOnSubmit } from "./ui";

export type ProfileFormValues = {
  name: string;
  foundedYear: string;
  licenseeCount: string;
  address: string;
  postalCode: string;
  city: string;
  websiteUrl: string;
  description: string;
  indoorCourts: string;
  outdoorCourts: string;
};

/** Formulaire de la fiche (admins). Un champ vidé efface la valeur. Confirmation avant d'enregistrer. */
export function ClubProfileForm({ clubId, initial }: { clubId: string; initial: ProfileFormValues }) {
  const [state, action] = useActionState(updateClubProfileAction, initialFormState);
  const v = (k: keyof ProfileFormValues) => state.values?.[k] ?? initial[k];
  const e = state.errors ?? {};
  return (
    <form action={action} onSubmit={confirmOnSubmit("Confirmer ces changements ?")} className="space-y-4" data-testid="club-profile-form">
      <input type="hidden" name="clubId" value={clubId} />
      <Field label="Nom du club" name="name" required maxLength={60} defaultValue={v("name")} error={e.name} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Année de fondation" name="foundedYear" inputMode="numeric" maxLength={4} placeholder="1974" defaultValue={v("foundedYear")} error={e.foundedYear} />
        <Field label="Nombre de licenciés" name="licenseeCount" inputMode="numeric" maxLength={String(LICENSEES_MAX).length} placeholder="250" defaultValue={v("licenseeCount")} error={e.licenseeCount} />
      </div>
      <Field label="Adresse" name="address" maxLength={ADDRESS_MAX} autoComplete="street-address" defaultValue={v("address")} error={e.address} />
      <div className="grid grid-cols-[8rem_1fr] gap-3">
        <Field label="Code postal" name="postalCode" inputMode="numeric" maxLength={POSTAL_CODE_MAX} autoComplete="postal-code" defaultValue={v("postalCode")} error={e.postalCode} />
        <Field label="Ville" name="city" maxLength={CITY_MAX} autoComplete="address-level2" defaultValue={v("city")} error={e.city} />
      </div>
      <Field
        label="Site web du club"
        name="websiteUrl"
        inputMode="url"
        autoCapitalize="none"
        autoCorrect="off"
        maxLength={WEBSITE_MAX}
        placeholder="https://www.monclub.fr"
        hint="Doit commencer par https:// ou http://."
        defaultValue={v("websiteUrl")}
        error={e.websiteUrl}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Courts intérieurs" name="indoorCourts" inputMode="numeric" maxLength={String(COURTS_MAX).length} defaultValue={v("indoorCourts")} error={e.indoorCourts} />
        <Field label="Courts extérieurs" name="outdoorCourts" inputMode="numeric" maxLength={String(COURTS_MAX).length} defaultValue={v("outdoorCourts")} error={e.outdoorCourts} />
      </div>
      <div className="space-y-1">
        <label htmlFor="club-description" className="block font-medium">
          Description
        </label>
        <textarea
          id="club-description"
          name="description"
          rows={4}
          maxLength={DESCRIPTION_MAX}
          aria-invalid={e.description ? true : undefined}
          className="block w-full rounded-lg border border-ink-muted bg-surface px-3 py-2 text-ink focus-visible:outline-2 focus-visible:outline-primary"
          defaultValue={v("description")}
        />
        <p className="text-sm text-ink-muted">{DESCRIPTION_MAX} caractères au maximum. Laisse un champ vide pour l&apos;effacer.</p>
        {e.description && <FieldError>{e.description}</FieldError>}
      </div>
      <FormMessage signal={state} ok={state.ok}>{state.message}</FormMessage>
      <SubmitButton pendingLabel="Enregistrement…">Enregistrer la fiche</SubmitButton>
    </form>
  );
}

/** Bouton « Importer un logo » : le fichier part dès qu'il est choisi (même principe que la photo de profil). */
export function ClubLogoUploadButton({ clubId, hasLogo }: { clubId: string; hasLogo: boolean }) {
  const [state, action, pending] = useActionState(uploadClubLogoAction, initialFormState);
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  return (
    <form ref={form} action={action} className="flex w-full flex-col items-center gap-2" data-testid="club-logo-upload">
      <input type="hidden" name="clubId" value={clubId} />
      <input
        ref={input}
        type="file"
        name="logo"
        accept="image/jpeg,image/png,image/webp"
        tabIndex={-1}
        aria-hidden="true"
        className="hidden"
        data-testid="club-logo-input"
        onChange={(e) => e.currentTarget.files?.length && form.current?.requestSubmit()}
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => input.current?.click()}
        className="inline-flex min-h-11 items-center justify-center rounded-lg border border-primary bg-surface px-5 font-semibold text-primary transition-opacity disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {pending ? "Envoi…" : hasLogo ? "Changer le logo" : "Importer un logo"}
      </button>
      <p className="text-center text-sm text-ink-muted">JPG, PNG ou WebP, {PHOTO_MAX_BYTES / 1024 / 1024} Mo au maximum. Le logo n&apos;est pas recadré.</p>
      <FormMessage signal={state} ok={state.ok}>{state.message}</FormMessage>
    </form>
  );
}

export function RemoveClubLogoForm({ clubId }: { clubId: string }) {
  const [state, action] = useActionState(removeClubLogoAction, initialFormState);
  return (
    <form action={action} onSubmit={confirmOnSubmit("Retirer le logo du club ?")} className="flex flex-col items-center gap-2">
      <input type="hidden" name="clubId" value={clubId} />
      <SubmitButton variant="ghost" pendingLabel="…">
        Retirer le logo
      </SubmitButton>
      {state.message && !state.ok && <FormMessage signal={state} ok={state.ok}>{state.message}</FormMessage>}
    </form>
  );
}

/**
 * Admins : le bouton « Modifier la fiche » ouvre le bloc de modification (logo et formulaire, passés en `children`) ;
 * rien de tout cela n'est affiché avant le clic. « Fermer » le replie.
 */
export function EditProfilePanel({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    panel.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, [open]);
  if (!open) {
    return (
      <button
        type="button"
        aria-expanded={false}
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 font-semibold text-on-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        data-testid="profile-edit-open"
      >
        Modifier la fiche
      </button>
    );
  }
  return (
    <div ref={panel} className="scroll-mt-4 space-y-5 rounded-2xl bg-surface p-4 shadow-sm" data-testid="profile-edit">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-serif text-xl text-primary">Modifier la fiche</h2>
        <button
          type="button"
          aria-expanded
          onClick={() => setOpen(false)}
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-primary bg-surface px-4 font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Fermer
        </button>
      </div>
      {children}
    </div>
  );
}
