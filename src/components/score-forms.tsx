"use client";

import { useActionState } from "react";
import {
  confirmScoreAction,
  disputeScoreAction,
  proposeScoreAction,
  resolveDisputeAction,
  withdrawScoreAction,
} from "@/app/actions/scores";
import { initialFormState } from "@/app/actions/types";
import { OUTCOME_LABELS } from "@/lib/scores/result";
import { Field, FormMessage, Select, SubmitButton, confirmOnSubmit } from "./ui";

export type ScoreMatch = {
  id: string;
  number: number;
  home: string;
  away: string;
  /** Valeurs de départ (résultat proposé, pour trancher un litige). */
  result: null | { outcome: keyof typeof OUTCOME_LABELS; winnerSide: "HOME" | "AWAY" | null; sets: string };
};

const outcomeOptions = Object.entries(OUTCOME_LABELS).map(([value, label]) => ({ value, label }));

function ScoreFields({ matches, values }: { matches: ScoreMatch[]; values?: Record<string, string> }) {
  return (
    <>
      {matches.map((m) => (
        <fieldset key={m.id} className="space-y-3 border-t border-line pt-3">
          <legend className="font-semibold text-primary">
            Simple {m.number} : {m.home} contre {m.away}
          </legend>
          <input type="hidden" name="matchId" value={m.id} />
          <Select
            label={`Issue du simple ${m.number}`}
            name={`outcome_${m.id}`}
            defaultValue={values?.[`outcome_${m.id}`] ?? m.result?.outcome ?? "COMPLETED"}
            options={outcomeOptions}
          />
          <Select
            label={`Vainqueur du simple ${m.number}`}
            name={`winner_${m.id}`}
            placeholder="Aucun (match non joué)"
            defaultValue={values?.[`winner_${m.id}`] ?? m.result?.winnerSide ?? ""}
            options={[
              { value: "HOME", label: m.home },
              { value: "AWAY", label: m.away },
            ]}
          />
          <Field
            label={`Sets du simple ${m.number} (facultatif)`}
            name={`sets_${m.id}`}
            defaultValue={values?.[`sets_${m.id}`] ?? m.result?.sets ?? ""}
            placeholder="6-4 3-6 10-8"
            hint="Score du domicile en premier, séparé par des espaces. Le troisième set à 10 points est un super tie-break."
          />
        </fieldset>
      ))}
    </>
  );
}

export function ProposeScoreForm({ encounterId, matches }: { encounterId: string; matches: ScoreMatch[] }) {
  const [state, action] = useActionState(proposeScoreAction, initialFormState);
  return (
    <form
      key={JSON.stringify(state.values ?? {})}
      action={action}
      onSubmit={confirmOnSubmit("Proposer ce score ? Une autre personne devra le confirmer. Vous pourrez le retirer tant qu'il n'est pas confirmé.")}
      className="space-y-3"
      noValidate
    >
      <input type="hidden" name="encounterId" value={encounterId} />
      <ScoreFields matches={matches} values={state.values} />
      <FormMessage>{state.message}</FormMessage>
      <SubmitButton className="w-full" pendingLabel="Envoi…">
        Proposer le score
      </SubmitButton>
    </form>
  );
}

export function ResolveDisputeForm({ encounterId, matches }: { encounterId: string; matches: ScoreMatch[] }) {
  const [state, action] = useActionState(resolveDisputeAction, initialFormState);
  return (
    <form
      key={JSON.stringify(state.values ?? {})}
      action={action}
      onSubmit={confirmOnSubmit("Valider ce score ? C'est définitif : plus personne ne pourra le modifier.")}
      className="space-y-3"
      noValidate
    >
      <input type="hidden" name="encounterId" value={encounterId} />
      <p className="rounded-lg border-l-4 border-accent bg-canvas p-3 font-semibold" data-testid="cheat-warning">
        Chaque triche sera suivie d&apos;un bannissement à vie de Ralli.
      </p>
      <ScoreFields matches={matches} values={state.values} />
      <FormMessage>{state.message}</FormMessage>
      <SubmitButton className="w-full" pendingLabel="Validation…">
        Trancher le litige
      </SubmitButton>
    </form>
  );
}

export function ConfirmScoreForm({ encounterId }: { encounterId: string }) {
  const [state, action] = useActionState(confirmScoreAction, initialFormState);
  return (
    <form action={action} onSubmit={confirmOnSubmit("Confirmer ce score ? C'est définitif.")} className="space-y-2">
      <input type="hidden" name="encounterId" value={encounterId} />
      <SubmitButton className="w-full" pendingLabel="Confirmation…">
        Confirmer le score
      </SubmitButton>
      <FormMessage>{state.message}</FormMessage>
    </form>
  );
}

export function DisputeScoreForm({ encounterId }: { encounterId: string }) {
  const [state, action] = useActionState(disputeScoreAction, initialFormState);
  return (
    <form key={JSON.stringify(state.values ?? {})} action={action} onSubmit={confirmOnSubmit("Contester ce score ? Un admin du club devra trancher.")} className="space-y-3" noValidate>
      <input type="hidden" name="encounterId" value={encounterId} />
      <Field label="Motif de la contestation" name="reason" maxLength={300} defaultValue={state.values?.reason ?? ""} error={state.errors?.reason} />
      <SubmitButton variant="ghost">Contester le score</SubmitButton>
      <FormMessage>{state.message}</FormMessage>
    </form>
  );
}

export function WithdrawScoreForm({ encounterId }: { encounterId: string }) {
  const [state, action] = useActionState(withdrawScoreAction, initialFormState);
  return (
    <form action={action} onSubmit={confirmOnSubmit("Retirer votre proposition ? Les résultats saisis seront effacés.")} className="space-y-2">
      <input type="hidden" name="encounterId" value={encounterId} />
      <SubmitButton variant="ghost">Retirer ma proposition</SubmitButton>
      <FormMessage>{state.message}</FormMessage>
    </form>
  );
}
