"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useActionState, useEffect, useRef, useState } from "react";
import { deleteClubAction, removeClubLogoAction, setPublicPageAction, updateClubProfileAction, uploadClubLogoAction } from "@/app/actions/club-profile";
import { initialFormState } from "@/app/actions/types";
import { PHOTO_MAX_BYTES } from "@/lib/avatars";
import { ADDRESS_MAX, CITY_MAX, COURTS_MAX, DESCRIPTION_MAX, LICENSEES_MAX, POSTAL_CODE_MAX, WEBSITE_MAX } from "@/lib/clubs/profile";
import { publicPath } from "@/lib/clubs/slug";
import { CopyLinkButton, WhatsAppShare } from "./share-link";
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

/**
 * Page publique du club (admins) : activer / désactiver, adresse modifiable, lien et partage. Désactivée au départ.
 * Une confirmation précède chaque changement de visibilité (la page devient lisible de tous, sans compte).
 */
export function PublicPageForm({ clubId, publicPage, slug }: { clubId: string; publicPage: boolean; slug: string | null }) {
  const router = useRouter();
  const [state, action] = useActionState(setPublicPageAction, initialFormState);
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);
  const path = slug ? publicPath(slug) : null;
  return (
    <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm" data-testid="public-page-panel">
      <h2 className="font-serif text-xl text-primary">Page publique</h2>
      <p className="text-sm text-ink-muted">
        {publicPage
          ? "Tout le monde peut voir les résultats et les prochaines rencontres du club avec ce lien, sans compte. Les membres et leurs pronostics ne sont jamais montrés."
          : "Désactivée : seuls les comptes Ralli voient le club. Active-la pour partager un lien avec les résultats du club (site, WhatsApp, Instagram)."}
      </p>
      <form
        action={action}
        onSubmit={(e) => {
          const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
          const message = submitter?.value === "0" ? "Désactiver la page publique ? Le lien ne marchera plus." : submitter?.value === "1" ? "Rendre la page du club visible de tous, sans compte ?" : null;
          if (message && !window.confirm(message)) e.preventDefault();
        }}
        className="space-y-3"
      >
        <input type="hidden" name="clubId" value={clubId} />
        {publicPage && (
          <>
            <Field label="Adresse de la page" name="slug" defaultValue={state.values?.slug ?? slug ?? ""} maxLength={50} hint="Lettres minuscules, chiffres et tirets" error={state.errors?.slug} />
            {path && (
              <p className="break-all text-sm" data-testid="public-page-link">
                Lien : <a href={path} className="font-semibold text-primary underline">{path}</a>
              </p>
            )}
          </>
        )}
        <div className="flex flex-wrap gap-3">
          {publicPage ? (
            <>
              <SubmitButton name="enabled" value="keep" pendingLabel="…">Enregistrer l&apos;adresse</SubmitButton>
              <SubmitButton name="enabled" value="0" variant="ghost" pendingLabel="…">Désactiver</SubmitButton>
            </>
          ) : (
            <SubmitButton name="enabled" value="1" pendingLabel="…">Activer la page publique</SubmitButton>
          )}
        </div>
        <FormMessage signal={state} ok={state.ok}>{state.message}</FormMessage>
      </form>
      {publicPage && path && (
        <div className="flex flex-wrap gap-3">
          <CopyLinkButton path={path} />
          <WhatsAppShare text={`Les résultats de notre club sur Ralli :`} path={path} label="Partager la page" />
        </div>
      )}
    </div>
  );
}

const DELETE_WORD = "SUPPRIMER";

/**
 * Bas de la fiche (admins) : petit lien « Supprimer le club ». L'encart de confirmation demande de saisir « SUPPRIMER » en
 * toutes lettres (majuscules) ; « Oui » reste grisé tant que le mot n'est pas exact. Le serveur revérifie le mot.
 */
export function DeleteClubSection({ clubId, clubName }: { clubId: string; clubName: string }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const [state, action] = useActionState(deleteClubAction, initialFormState);
  useEffect(() => {
    if (state.ok) router.push("/clubs");
  }, [state, router]);
  const close = () => {
    dialog.current?.close();
    setTyped("");
  };
  return (
    <div className="pt-4 text-center">
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        data-testid="delete-club-open"
        className="inline-flex min-h-11 items-center px-3 text-sm text-danger underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        Supprimer le club
      </button>
      <dialog ref={dialog} className="sheet" aria-label="Supprimer le club" data-testid="delete-club-dialog" onClose={() => setTyped("")}>
        <form action={action} className="mx-auto grid w-full max-w-xl gap-4 rounded-t-3xl bg-surface px-5 pb-6 pt-5 text-left">
          <input type="hidden" name="clubId" value={clubId} />
          <h2 className="font-serif text-2xl text-primary">Supprimer {clubName} ?</h2>
          <p>
            Le club, ses équipes et ses rencontres disparaissent pour tout le monde, et le lien de sa page publique ne marche plus. Les rencontres pas
            terminées sont annulées et les pronostics en cours remboursés. Cette action est définitive pour les membres.
          </p>
          <Field label={`Pour confirmer, saisis ${DELETE_WORD} en toutes lettres`} name="confirmation" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="off" data-testid="delete-club-input" />
          <div className="flex gap-3">
            <SubmitButton disabled={typed !== DELETE_WORD} pendingLabel="Suppression…" data-testid="delete-club-yes">
              Oui
            </SubmitButton>
            <button
              type="button"
              onClick={close}
              data-testid="delete-club-no"
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-primary bg-surface px-5 font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              Non
            </button>
          </div>
          {state.message && !state.ok && <FormMessage signal={state} ok={state.ok}>{state.message}</FormMessage>}
        </form>
      </dialog>
    </div>
  );
}
