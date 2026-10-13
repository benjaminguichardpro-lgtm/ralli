"use client";

import { useActionState } from "react";
import { deleteStoryAction } from "@/app/actions/stories";
import { dismissReportsAction } from "@/app/actions/win-cards";
import { initialFormState } from "@/app/actions/types";
import { FormMessage, SubmitButton, confirmOnSubmit } from "./ui";

/** Une carte signalée, vue par un admin : « Écarter » le signalement (la carte reste) ou « Supprimer la carte » (avec confirmation). */
export function ReportReview({ storyId, authorName }: { storyId: string; authorName: string }) {
  const [dismissState, dismissAction] = useActionState(dismissReportsAction, initialFormState);
  const [deleteState, deleteAction] = useActionState(deleteStoryAction, initialFormState);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={dismissAction}>
        <input type="hidden" name="storyId" value={storyId} />
        <SubmitButton variant="ghost" className="text-sm" aria-label={`Écarter le signalement de la carte de ${authorName}`} pendingLabel="Un instant…">
          Écarter
        </SubmitButton>
      </form>
      <form action={deleteAction} onSubmit={confirmOnSubmit(`Supprimer la carte de ${authorName} ? Elle disparaîtra pour tout le club.`)}>
        <input type="hidden" name="storyId" value={storyId} />
        <SubmitButton className="text-sm" aria-label={`Supprimer la carte de ${authorName}`} pendingLabel="Un instant…">
          Supprimer la carte
        </SubmitButton>
      </form>
      <FormMessage signal={dismissState} ok={dismissState.ok}>{dismissState.message}</FormMessage>
      <FormMessage signal={deleteState} ok={deleteState.ok}>{deleteState.message}</FormMessage>
    </div>
  );
}
