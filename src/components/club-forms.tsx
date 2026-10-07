"use client";

import { useActionState } from "react";
import {
  createClubAction,
  joinClubAction,
  regenerateInviteCodeAction,
  setMemberRoleAction,
} from "@/app/actions/clubs";
import { initialFormState } from "@/app/actions/types";
import { Field, FormMessage, SubmitButton } from "./ui";

export function CreateClubForm() {
  const [state, action] = useActionState(createClubAction, initialFormState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <Field label="Nom du club" name="name" required defaultValue={state.values?.name} error={state.errors?.name} />
      <SubmitButton className="w-full" pendingLabel="Création…">
        Créer le club
      </SubmitButton>
    </form>
  );
}

export function JoinClubForm({ defaultCode }: { defaultCode?: string }) {
  const [state, action] = useActionState(joinClubAction, initialFormState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <Field
        label="Code d'invitation"
        name="code"
        required
        autoComplete="off"
        autoCapitalize="characters"
        maxLength={6}
        className="block min-h-11 w-full rounded-lg border border-ink-muted bg-surface px-3 font-mono text-xl tracking-widest uppercase"
        defaultValue={state.values?.code ?? defaultCode}
        error={state.errors?.code}
        hint="6 caractères, fournis par l'admin du club."
      />
      <SubmitButton className="w-full" pendingLabel="Vérification…">
        Rejoindre
      </SubmitButton>
    </form>
  );
}

export function RegenerateCodeForm({ clubId }: { clubId: string }) {
  const [state, action] = useActionState(regenerateInviteCodeAction, initialFormState);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="clubId" value={clubId} />
      <SubmitButton variant="ghost" pendingLabel="Génération…">
        Générer un nouveau code
      </SubmitButton>
      {state.message && <p className="text-sm text-ink-muted">{state.message}</p>}
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
  // Se retirer soi-même le rôle admin est irréversible sans l'aide d'un autre admin : on demande confirmation.
  const confirmSelfDemotion = (e: React.FormEvent<HTMLFormElement>) => {
    if (isSelf && next === "MEMBER" && !window.confirm("Êtes-vous sûr de vouloir vous retirer le rôle admin ?")) {
      e.preventDefault();
    }
  };
  return (
    <form action={action} onSubmit={confirmSelfDemotion} className="space-y-1">
      <input type="hidden" name="clubId" value={clubId} />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="role" value={next} />
      <SubmitButton variant="ghost" className="text-sm" aria-label={`${next === "ADMIN" ? "Nommer admin" : "Retirer le rôle admin de"} ${displayName}`}>
        {next === "ADMIN" ? "Nommer admin" : "Retirer admin"}
      </SubmitButton>
      <FormMessage>{state.message}</FormMessage>
    </form>
  );
}
