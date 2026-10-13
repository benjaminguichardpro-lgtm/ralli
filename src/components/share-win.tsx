"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { shareWinAction } from "@/app/actions/win-cards";
import { initialFormState } from "@/app/actions/types";
import type { AvatarRef } from "@/lib/avatars";
import { WIN_COMMENT_MAX, whatsappText } from "@/lib/win-cards";
import type { WinCardData } from "@/server/win-cards";
import { WhatsAppShare } from "./share-link";
import { FormMessage, SubmitButton } from "./ui";
import { WinCard } from "./win-card";

/**
 * « Partager ma victoire » : aperçu de la carte, commentaire facultatif (140 caractères), puis confirmation
 * « Publier pour <club> ? » avant l'envoi. Une fois publié, le bouton WhatsApp propose de la montrer aussi hors de Ralli.
 * `autoOpen` ouvre la fenêtre tout de suite (lien « Partager ma victoire » de la fenêtre de résultats).
 */
export function ShareWinButton({ card, clubName, author, autoOpen = false }: { card: WinCardData; clubName: string; author: { name: string; avatar: AvatarRef }; autoOpen?: boolean }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(autoOpen);
  const [state, action] = useActionState(shareWinAction, initialFormState);
  const [comment, setComment] = useState("");
  // La confirmation reste affichée tant que le serveur n'a pas répondu : une réponse (erreur) ramène à la saisie.
  const [previewOf, setPreviewOf] = useState<object | null>(null);
  const step = state.ok ? "done" : previewOf === state ? "preview" : "edit";
  const tooLong = comment.length > WIN_COMMENT_MAX;

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
  }, [open]);

  const close = () => {
    dialog.current?.close();
    setOpen(false);
    if (state.ok) router.replace("/rallis", { scroll: false });
    router.refresh();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="share-win"
        className="inline-flex min-h-11 items-center rounded-lg bg-gold px-4 text-sm font-semibold text-on-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        Partager ma victoire
      </button>
      {open && (
        <dialog ref={dialog} className="sheet" aria-label="Partager ma victoire" data-testid="share-win-dialog" onClose={() => { setOpen(false); }}>
          <form action={action} className="mx-auto grid max-h-[90dvh] w-full max-w-xl gap-4 overflow-y-auto rounded-t-3xl bg-surface px-5 pb-6 pt-4" noValidate>
            <input type="hidden" name="predictionId" value={card.predictionId} />
            <input type="hidden" name="comment" value={comment} />
            <h2 className="font-serif text-2xl text-primary">Partager ma victoire</h2>
            <WinCard card={card} author={author} comment={comment.trim()} />

            {step === "edit" && (
              <div className="grid gap-4">
                <div className="space-y-1">
                  <label htmlFor="win-comment" className="block font-medium">
                    Un mot pour le club (facultatif)
                  </label>
                  <textarea id="win-comment" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} className="block w-full rounded-lg border border-ink-muted bg-surface px-3 py-2" />
                  <p className={`text-sm ${tooLong ? "font-semibold text-ink" : "text-ink-muted"}`} data-testid="win-comment-counter">
                    {comment.length}/{WIN_COMMENT_MAX}
                  </p>
                </div>
                <FormMessage signal={state} ok={state.ok}>{state.message}</FormMessage>
                <div className="flex gap-3">
                  <button type="button" onClick={close} className="min-h-11 flex-1 rounded-lg border border-primary px-4 font-semibold text-primary">
                    Annuler
                  </button>
                  <button type="button" disabled={tooLong} onClick={() => setPreviewOf(state)} className="min-h-11 flex-1 rounded-lg bg-primary px-4 font-semibold text-on-primary disabled:opacity-50">
                    Continuer
                  </button>
                </div>
              </div>
            )}

            {step === "preview" && (
              <div className="grid gap-4" data-testid="share-win-confirm">
                <p className="font-medium">Publier pour {clubName} ? Les membres du club la verront pendant 24 h.</p>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setPreviewOf(null)} className="min-h-11 flex-1 rounded-lg border border-primary px-4 font-semibold text-primary">
                    Modifier
                  </button>
                  <SubmitButton className="flex-1" pendingLabel="Publication…">
                    Publier
                  </SubmitButton>
                </div>
              </div>
            )}

            {step === "done" && (
              <div className="grid gap-3" data-testid="share-win-done">
                <FormMessage signal={state} ok={state.ok}>{state.message}</FormMessage>
                <WhatsAppShare text={whatsappText(card.payoutAces, card.matchLabel)} path={`/rencontres/${card.encounterId}`} label="Partager aussi sur WhatsApp" />
                <button type="button" onClick={close} className="min-h-11 rounded-lg border border-primary px-4 font-semibold text-primary">
                  Fermer
                </button>
              </div>
            )}
          </form>
        </dialog>
      )}
    </>
  );
}
