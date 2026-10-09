"use client";

import { useActionState } from "react";
import { archiveEncounterAction, unarchiveEncounterAction } from "@/app/actions/encounters";
import { initialFormState } from "@/app/actions/types";
import { SubmitButton, confirmOnSubmit } from "./ui";

/** Petite croix rouge : range la rencontre dans les archives (après confirmation). Rien n'est supprimé. */
export function ArchiveEncounterButton({ encounterId, label }: { encounterId: string; label: string }) {
  const [state, action, pending] = useActionState(archiveEncounterAction, initialFormState);
  return (
    <form
      action={action}
      onSubmit={confirmOnSubmit("Archiver cette rencontre ? Elle disparaîtra de la liste du club. Le score, les classements et les Aces ne changent pas, et vous pourrez la retrouver dans les archives.")}
      className="shrink-0"
    >
      <input type="hidden" name="encounterId" value={encounterId} />
      <button
        type="submit"
        disabled={pending}
        aria-label={`Archiver la rencontre ${label}`}
        title="Archiver"
        data-testid="archive-encounter"
        // Zone de toucher de 44 px (invisible) autour d'une petite croix de 24 px.
        className="inline-flex size-11 items-center justify-center rounded-full text-danger transition-opacity disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-danger"
      >
        <span aria-hidden="true" className="inline-flex size-6 items-center justify-center rounded-full border-[1.5px] border-danger bg-surface text-xs font-bold leading-none">
          ✕
        </span>
      </button>
      {state.message && <p role="alert" className="text-xs text-danger">{state.message}</p>}
    </form>
  );
}

export function UnarchiveEncounterButton({ encounterId, label }: { encounterId: string; label: string }) {
  const [state, action] = useActionState(unarchiveEncounterAction, initialFormState);
  return (
    <form action={action} className="shrink-0">
      <input type="hidden" name="encounterId" value={encounterId} />
      <SubmitButton variant="ghost" className="text-sm" pendingLabel="…" aria-label={`Désarchiver la rencontre ${label}`} data-testid="unarchive-encounter">
        Désarchiver
      </SubmitButton>
      {state.message && <p role="alert" className="text-xs text-danger">{state.message}</p>}
    </form>
  );
}
