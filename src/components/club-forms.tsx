"use client";

import { useActionState } from "react";
import {
  createClubAction,
  decideReturnAction,
  removeMemberAction,
  submitClubRequestAction,
  setMemberRoleAction,
} from "@/app/actions/clubs";
import { initialFormState } from "@/app/actions/types";
import { Field, FieldError, FormMessage, SubmitButton, confirmOnSubmit } from "./ui";

export function CreateClubForm() {
  const [state, action] = useActionState(createClubAction, initialFormState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <Field label="Nom du club" name="name" required defaultValue={state.values?.name} error={state.errors?.name} />
      {state.message ? <FieldError>{state.message}</FieldError> : null}
      <SubmitButton className="w-full" pendingLabel="Création…">
        Créer le club
      </SubmitButton>
    </form>
  );
}

export function ClubRequestForm() {
  const [state, action] = useActionState(submitClubRequestAction, initialFormState);
  const f = (name: string) => ({ name, defaultValue: state.values?.[name], error: state.errors?.[name] });
  return (
    <form action={action} className="space-y-4" noValidate>
      <Field label="Nom complet" autoComplete="name" required {...f("fullName")} />
      <Field label="Nom du club" required {...f("clubName")} />
      <Field label="Ville" required {...f("city")} />
      <Field label="Fonction dans le club" hint="Président, responsable des interclubs…" required {...f("role")} />
      <Field label="Numéro d'affiliation FFT du club" required {...f("fftNumber")} />
      <Field label="Site ou page du club (facultatif)" type="url" inputMode="url" {...f("website")} />
      <Field label="Téléphone" type="tel" autoComplete="tel" required {...f("phone")} />
      <div className="space-y-1">
        <label htmlFor="request-message" className="block font-medium">
          Message (facultatif)
        </label>
        <textarea
          id="request-message"
          name="message"
          rows={4}
          maxLength={1000}
          defaultValue={state.values?.message}
          className="block w-full rounded-lg border border-ink-muted bg-surface px-3 py-2"
        />
        {state.errors?.message ? <FieldError>{state.errors.message}</FieldError> : null}
      </div>
      {state.message ? <FieldError>{state.message}</FieldError> : null}
      <SubmitButton className="w-full" pendingLabel="Envoi…">
        Envoyer ma demande
      </SubmitButton>
    </form>
  );
}

export function MemberRoleForm({
  clubId,
  userId,
  displayName,
  role,
  isSelf,
}: {
  clubId: string;
  userId: string;
  displayName: string;
  role: "ADMIN" | "MEMBER";
  isSelf: boolean;
}) {
  const [state, action] = useActionState(setMemberRoleAction, initialFormState);
  const next = role === "ADMIN" ? "MEMBER" : "ADMIN";
  // Retirer un rôle admin (le sien ou celui d'un autre) demande toujours une confirmation.
  const confirmDemotion = (e: React.FormEvent<HTMLFormElement>) => {
    if (next !== "MEMBER") return;
    const question = isSelf
      ? "Êtes-vous sûr de vouloir vous retirer le rôle admin ?"
      : `Êtes-vous sûr de vouloir retirer le rôle admin à ${displayName} ?`;
    if (!window.confirm(question)) e.preventDefault();
  };
  return (
    <form action={action} onSubmit={confirmDemotion} className="space-y-1">
      <input type="hidden" name="clubId" value={clubId} />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="role" value={next} />
      <SubmitButton variant="ghost" className="text-sm" aria-label={`${next === "ADMIN" ? "Nommer admin" : "Retirer le rôle admin de"} ${displayName}`}>
        {next === "ADMIN" ? "Nommer admin" : "Retirer admin"}
      </SubmitButton>
      <FormMessage signal={state} ok={state.ok}>{state.message}</FormMessage>
    </form>
  );
}

/** « Retirer du club » (admins) : confirmation, puis la personne devra demander à revenir. */
export function RemoveMemberForm({ clubId, userId, displayName }: { clubId: string; userId: string; displayName: string }) {
  const [state, action] = useActionState(removeMemberAction, initialFormState);
  return (
    <form
      action={action}
      onSubmit={confirmOnSubmit(`Retirer ${displayName} du club ? Ses pronostics en cours restent valables, mais il devra demander à revenir.`)}
      className="space-y-1"
    >
      <input type="hidden" name="clubId" value={clubId} />
      <input type="hidden" name="userId" value={userId} />
      <SubmitButton variant="ghost" className="text-sm" aria-label={`Retirer ${displayName} du club`} pendingLabel="Un instant…">
        Retirer du club
      </SubmitButton>
      <FormMessage signal={state} ok={state.ok}>{state.message}</FormMessage>
    </form>
  );
}

/** Une demande de retour : « Accepter » ou « Refuser ». */
export function ReturnRequestForm({ clubId, userId, displayName }: { clubId: string; userId: string; displayName: string }) {
  const [state, action] = useActionState(decideReturnAction, initialFormState);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="clubId" value={clubId} />
      <input type="hidden" name="userId" value={userId} />
      <SubmitButton name="decision" value="accept" className="text-sm" aria-label={`Accepter ${displayName}`} pendingLabel="Un instant…">
        Accepter
      </SubmitButton>
      <SubmitButton name="decision" value="decline" variant="ghost" className="text-sm" aria-label={`Refuser ${displayName}`} pendingLabel="Un instant…">
        Refuser
      </SubmitButton>
      <FormMessage signal={state} ok={state.ok}>{state.message}</FormMessage>
    </form>
  );
}
