"use client";

import { useActionState, useState } from "react";
import {
  createClubAction,
  joinClubAction,
  regenerateInviteCodeAction,
  setMemberRoleAction,
} from "@/app/actions/clubs";
import { initialFormState } from "@/app/actions/types";
import { invitePath } from "@/lib/clubs/invite-link";
import { WhatsAppShare } from "./share-link";
import { Field, FieldError, FormMessage, SubmitButton } from "./ui";

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

/** Page du lien d'invitation : une confirmation, pour ne pas entrer dans un club en touchant un lien par erreur. */
export function JoinInviteForm({ code, clubName }: { code: string; clubName: string }) {
  const [state, action] = useActionState(joinClubAction, initialFormState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="code" value={code} />
      {state.errors?.code && <FieldError>{state.errors.code}</FieldError>}
      <SubmitButton className="w-full" pendingLabel="Un instant…">
        Rejoindre {clubName}
      </SubmitButton>
    </form>
  );
}

/** Le code reste caché tant qu'on n'a pas appuyé sur le bouton (écran partagé, capture d'écran). */
export function InviteCodeReveal({ code, clubId, clubName }: { code: string; clubId: string; clubName: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="space-y-3">
      {shown && (
        <>
          <p data-testid="invite-code" className="font-mono text-3xl font-bold tracking-widest text-ink">
            {code}
          </p>
          <WhatsAppShare
            label="Inviter par WhatsApp"
            text={`Rejoins ${clubName} sur Ralli pour pronostiquer nos interclubs de tennis (jeu gratuit, sans argent réel) :`}
            path={invitePath(code)}
          />
          {/* Régénérer le code n'est proposé qu'une fois le code révélé. */}
          <RegenerateCodeForm clubId={clubId} />
        </>
      )}
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-expanded={shown}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 font-semibold text-on-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {shown ? "Masquer le code d'invitation" : "Révéler le code d'invitation"}
      </button>
    </div>
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
      <FormMessage>{state.message}</FormMessage>
    </form>
  );
}
