"use client";

import Link from "next/link";
import { useActionState } from "react";
import { changePasswordAction, signInAction, signUpAction } from "@/app/actions/auth";
import { initialFormState } from "@/app/actions/types";
import { PASSWORD_MIN } from "@/lib/validation/account";
import { Field, FormMessage, SubmitButton } from "./ui";

export function SignUpForm({ invitation }: { invitation?: string }) {
  const [state, action] = useActionState(signUpAction, initialFormState);
  const e = state.errors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      {invitation && <input type="hidden" name="invitation" value={invitation} />}
      <FormMessage>{e._}</FormMessage>
      <Field label="Email" name="email" type="email" autoComplete="email" required defaultValue={state.values?.email} error={e.email} />
      <Field
        label="Pseudo"
        name="displayName"
        autoComplete="nickname"
        required
        defaultValue={state.values?.displayName}
        error={e.displayName}
        hint="Affiché dans les classements. 3 à 20 caractères."
      />
      <Field
        label="Mot de passe"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        error={e.password}
        hint={`Au moins ${PASSWORD_MIN} caractères.`}
      />
      <SubmitButton className="w-full" pendingLabel="Création…">
        Créer mon compte
      </SubmitButton>
      <p className="text-center text-ink-muted">
        Déjà inscrit ?{" "}
        <Link href={invitation ? `/connexion?invitation=${invitation}` : "/connexion"} className="font-semibold text-primary underline">
          Se connecter
        </Link>
      </p>
    </form>
  );
}

export function SignInForm({ invitation }: { invitation?: string }) {
  const [state, action] = useActionState(signInAction, initialFormState);
  const e = state.errors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      {invitation && <input type="hidden" name="invitation" value={invitation} />}
      <FormMessage>{state.message}</FormMessage>
      <Field
        label="Email ou pseudo"
        name="identifier"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        defaultValue={state.values?.identifier}
        error={e.identifier}
      />
      <Field label="Mot de passe" name="password" type="password" autoComplete="current-password" required error={e.password} />
      <SubmitButton className="w-full" pendingLabel="Connexion…">
        Se connecter
      </SubmitButton>
      <p className="text-center text-sm text-ink-muted">
        Mot de passe oublié ? Demandez à l&apos;admin de votre club de contacter l&apos;équipe Ralli.
      </p>
      <p className="text-center text-ink-muted">
        Pas encore de compte ?{" "}
        <Link href={invitation ? `/inscription?invitation=${invitation}` : "/inscription"} className="font-semibold text-primary underline">
          S&apos;inscrire
        </Link>
      </p>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, action] = useActionState(changePasswordAction, initialFormState);
  const e = state.errors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      <Field
        label="Nouveau mot de passe"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        error={e.password}
        hint={`Au moins ${PASSWORD_MIN} caractères.`}
      />
      <Field label="Confirmer le mot de passe" name="confirm" type="password" autoComplete="new-password" required error={e.confirm} />
      <SubmitButton className="w-full">Enregistrer</SubmitButton>
    </form>
  );
}
