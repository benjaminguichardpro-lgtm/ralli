"use client";

import { useActionState } from "react";
import { joinClubButtonAction, leaveClubAction } from "@/app/actions/clubs";
import { initialFormState } from "@/app/actions/types";
import { FormMessage, SubmitButton, confirmOnSubmit } from "./ui";

/** « Rejoindre le club » : un seul bouton, sans code. Une fois membre, la page se rafraîchit et les pronostics s'ouvrent. */
export function JoinClubButton({ clubId, className = "" }: { clubId: string; className?: string }) {
  const [state, action] = useActionState(joinClubButtonAction, initialFormState);
  return (
    <form action={action} className={`space-y-2 ${className}`}>
      <input type="hidden" name="clubId" value={clubId} />
      <SubmitButton className="w-full" pendingLabel="Un instant…">
        Rejoindre le club
      </SubmitButton>
      <FormMessage signal={state} ok={state.ok}>{state.message}</FormMessage>
    </form>
  );
}

/** « Quitter le club » avec confirmation (tes pronostics en cours restent valables). */
export function LeaveClubForm({ clubId, clubName }: { clubId: string; clubName: string }) {
  const [state, action] = useActionState(leaveClubAction, initialFormState);
  return (
    <form action={action} onSubmit={confirmOnSubmit(`Quitter ${clubName} ? Tes pronostics en cours restent valables.`)} className="space-y-2">
      <input type="hidden" name="clubId" value={clubId} />
      <SubmitButton variant="ghost" pendingLabel="Un instant…">
        Quitter le club
      </SubmitButton>
      <FormMessage signal={state} ok={state.ok}>{state.message}</FormMessage>
    </form>
  );
}

/** Barre de recherche de club : envoie vers la page de recherche (`/clubs/recherche?q=`). */
export function ClubSearchBar({ defaultValue = "", autoFocus = false }: { defaultValue?: string; autoFocus?: boolean }) {
  return (
    <form action="/clubs/recherche" role="search" className="flex gap-2">
      <label htmlFor="club-search" className="sr-only">
        Rechercher un club
      </label>
      <input
        id="club-search"
        name="q"
        type="search"
        defaultValue={defaultValue}
        autoFocus={autoFocus}
        autoComplete="off"
        placeholder="Rechercher un club (nom, ville, code postal)"
        className="min-h-11 min-w-0 flex-1 rounded-lg border border-ink-muted bg-surface px-3"
      />
      <button type="submit" className="min-h-11 rounded-lg bg-primary px-4 font-semibold text-on-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
        Chercher
      </button>
    </form>
  );
}
