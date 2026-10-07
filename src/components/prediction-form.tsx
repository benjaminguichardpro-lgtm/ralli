"use client";

import { useActionState } from "react";
import { placePredictionAction } from "@/app/actions/predictions";
import { initialFormState } from "@/app/actions/types";
import { Field, FieldError, FormMessage, SubmitButton } from "./ui";

export function PredictionForm({
  matchId,
  homeName,
  awayName,
  oddsHome,
  oddsAway,
  balance,
}: {
  matchId: string;
  homeName: string;
  awayName: string;
  oddsHome: string;
  oddsAway: string;
  balance: number;
}) {
  const [state, action] = useActionState(placePredictionAction, initialFormState);
  const e = state.errors ?? {};
  return (
    <form action={action} className="space-y-3" noValidate>
      <input type="hidden" name="matchId" value={matchId} />
      <FormMessage>{state.message}</FormMessage>
      <fieldset className="space-y-1">
        <legend className="font-medium">Votre pronostic</legend>
        {[
          { side: "HOME", name: homeName, odds: oddsHome },
          { side: "AWAY", name: awayName, odds: oddsAway },
        ].map((o) => (
          <label key={o.side} className="flex min-h-11 items-center gap-2">
            <input type="radio" name="side" value={o.side} defaultChecked={state.values?.side === o.side} className="size-5 accent-primary" />
            <span>
              {o.name} gagne, cote {o.odds}
            </span>
          </label>
        ))}
        {e.side && <FieldError>{e.side}</FieldError>}
      </fieldset>
      <Field
        label="Aces engagés"
        name="committedAces"
        type="number"
        inputMode="numeric"
        min={10}
        max={balance}
        step={1}
        defaultValue={state.values?.committedAces ?? ""}
        error={e.committedAces}
        hint={`Minimum 10, au plus votre solde (${balance.toLocaleString("fr-FR")} Aces). Définitif une fois validé.`}
      />
      <SubmitButton className="w-full" pendingLabel="Validation…">
        Valider mon pronostic
      </SubmitButton>
    </form>
  );
}
