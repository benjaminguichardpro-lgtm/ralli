"use client";

import Link from "next/link";
import { type ComponentProps, type ReactNode, useId, useState } from "react";
import { useFormStatus } from "react-dom";

// Composants d'interface partagés. Couleurs : uniquement via les tokens du thème (globals.css).

const base =
  "inline-flex min-h-11 items-center justify-center rounded-lg px-4 font-semibold transition-opacity disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const variants = {
  primary: "bg-primary text-on-primary",
  secondary: "bg-accent text-on-accent",
  ghost: "border border-primary bg-surface text-primary",
  gold: "bg-gold text-on-gold", // or : seulement sur fond vert foncé (panneau de pronostic)
} as const;
type Variant = keyof typeof variants;

export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  className = "",
  ...rest
}: { children: ReactNode; pendingLabel?: string; variant?: Variant } & ComponentProps<"button">) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${base} ${variants[variant]} ${className}`} {...rest}>
      {pending ? (pendingLabel ?? "Un instant…") : children}
    </button>
  );
}

export function ButtonLink({
  href,
  children,
  variant = "primary",
  className = "",
}: {
  href: string;
  children: ReactNode;
  variant?: Variant;
  className?: string;
}) {
  return (
    <Link href={href} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </Link>
  );
}

export function Field({
  label,
  name,
  error,
  hint,
  adornment,
  ...input
}: { label: string; name: string; error?: string; hint?: string; adornment?: ReactNode } & ComponentProps<"input">) {
  const id = useId();
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`block min-h-11 w-full rounded-lg border border-ink-muted bg-surface px-3 text-ink focus-visible:outline-2 focus-visible:outline-primary ${adornment ? "pr-12" : ""}`}
          {...input}
        />
        {adornment}
      </div>
      {hint && !error && (
        <p id={`${id}-hint`} className="text-sm text-ink-muted">
          {hint}
        </p>
      )}
      {error && <FieldError id={`${id}-err`}>{error}</FieldError>}
    </div>
  );
}

/**
 * Afficher / masquer un mot de passe. `resetKey` est l'état renvoyé par le formulaire (useActionState) :
 * dès que le serveur répond (formulaire refusé…), le mot de passe se cache de nouveau. Il se cache aussi en quittant l'écran.
 */
export function useRevealPassword(resetKey: unknown): [boolean, () => void] {
  const [revealed, setRevealed] = useState<{ key: unknown } | null>(null);
  const shown = revealed !== null && revealed.key === resetKey;
  return [shown, () => setRevealed(shown ? null : { key: resetKey })];
}

function EyeButton({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={shown ? "Masquer le mot de passe" : "Afficher le mot de passe"}
      aria-pressed={shown}
      className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-lg text-ink-muted focus-visible:outline-2 focus-visible:outline-primary"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6 fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
        {shown && <path d="M4 4l16 16" />}
      </svg>
    </button>
  );
}

/**
 * Champ de mot de passe avec son œil. Sans `onToggle`, le champ suit `shown` sans avoir son propre bouton
 * (cas d'un second champ commandé par l'œil du premier).
 */
export function PasswordField({
  shown,
  onToggle,
  ...field
}: Omit<ComponentProps<typeof Field>, "type" | "adornment"> & { shown: boolean; onToggle?: () => void }) {
  return (
    <Field
      {...field}
      type={shown ? "text" : "password"}
      // Une fois affiché, c'est un champ de texte : pas de majuscule ni de correction automatique du téléphone.
      {...(shown ? { autoCapitalize: "none", autoCorrect: "off", spellCheck: false } : {})}
      adornment={onToggle ? <EyeButton shown={shown} onToggle={onToggle} /> : undefined}
    />
  );
}

export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  // Texte d'erreur : couleur d'encre + préfixe, pas de rouge hors thème.
  return (
    <p id={id} role="alert" className="text-sm font-semibold text-ink">
      ⚠ {children}
    </p>
  );
}

export function FormMessage({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <div role="alert" className="rounded-lg border-l-4 border-accent bg-surface p-3 font-medium">
      {children}
    </div>
  );
}

export function Select({
  label,
  name,
  error,
  options,
  placeholder,
  ...select
}: {
  label: string;
  name: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
} & ComponentProps<"select">) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block font-medium">
        {label}
      </label>
      <select
        name={name}
        aria-invalid={error ? true : undefined}
        className="block min-h-11 w-full rounded-lg border border-ink-muted bg-surface px-3 text-ink focus-visible:outline-2 focus-visible:outline-primary"
        {...select}
        id={id}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}

/** Empêche l'envoi du formulaire si l'utilisateur annule la confirmation. */
export function confirmOnSubmit(message: string) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    if (!window.confirm(message)) e.preventDefault();
  };
}
