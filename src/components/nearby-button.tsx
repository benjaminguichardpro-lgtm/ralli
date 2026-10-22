"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PostalCodeForm } from "./location-forms";

const BUTTON =
  "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-primary bg-surface px-4 font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

function Pin() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </svg>
  );
}

/**
 * « Voir les interclubs à proximité » : mène aux résultats (`href`). Sans code postal enregistré, une fenêtre « Où es-tu ? »
 * le demande d'abord ; une fois enregistré (il reste dans le profil), on arrive directement sur les résultats.
 */
export function NearbyButton({ located, href }: { located: boolean; href: string }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
  }, [open]);

  if (located) {
    return (
      <Link href={href} className={BUTTON} data-testid="nearby-button">
        <Pin />
        Voir les interclubs à proximité
      </Link>
    );
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={BUTTON} data-testid="nearby-button">
        <Pin />
        Voir les interclubs à proximité
      </button>
      {open && (
        <dialog ref={dialog} className="sheet" aria-label="Où es-tu ?" data-testid="nearby-dialog" onClose={() => setOpen(false)}>
          <div className="mx-auto grid max-h-[90dvh] w-full max-w-xl gap-4 overflow-y-auto rounded-t-3xl bg-surface px-5 pb-6 pt-4">
            <h2 className="font-serif text-2xl text-primary">Où es-tu ?</h2>
            <p className="text-ink-muted">Indique le code postal de ta ville pour voir les interclubs près de chez toi. Tu pourras le modifier ou l&apos;effacer dans ton profil.</p>
            <PostalCodeForm
              submitLabel="Valider"
              onSaved={() => {
                dialog.current?.close();
                router.push(href);
              }}
            />
            <button type="button" onClick={() => dialog.current?.close()} className="min-h-11 rounded-lg border border-primary px-4 font-semibold text-primary">
              Annuler
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}
