"use client";

import Link from "next/link";
import { type ComponentProps, type ReactNode, useEffect, useId, useState } from "react";
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
  scroll,
}: {
  href: string;
  children: ReactNode;
  variant?: Variant;
  className?: string;
  /** false : reste à la même place après le clic (« Voir plus »). */
  scroll?: boolean;
}) {
  return (
    <Link href={href} scroll={scroll} className={`${base} ${variants[variant]} ${className}`}>
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

/** Une confirmation disparaît d'elle-même après ce délai (une erreur reste jusqu'à ce qu'on la corrige). */
const CONFIRMATION_VISIBLE_MS = 4000;

// Chaque réponse du serveur (objet d'état de useActionState) reçoit un numéro : un même texte reçu deux fois de suite
// (deux photos enregistrées l'une après l'autre) rejoue l'animation et repart pour 4 secondes.
let nextSignalId = 0;
const signalIds = new WeakMap<object, number>();
function signalId(signal: object): number {
  let id = signalIds.get(signal);
  if (id === undefined) {
    id = ++nextSignalId;
    signalIds.set(signal, id);
  }
  return id;
}

/**
 * Message d'un formulaire. Réussite (`ok`) : pastille verte, coche qui se dessine, texte ; disparaît au bout de 4 s.
 * Erreur : pastille rouge avec point d'exclamation, reste affichée. `signal` = l'état renvoyé par le formulaire.
 * Les animations sont coupées avec « réduire les animations » (voir globals.css).
 */
export function FormMessage({ children, ok = false, signal }: { children?: ReactNode; ok?: boolean; signal?: object }) {
  if (!children) return null;
  return (
    <MessageBox key={signal ? signalId(signal) : undefined} ok={ok}>
      {children}
    </MessageBox>
  );
}

function MessageBox({ children, ok }: { children: ReactNode; ok: boolean }) {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (!ok) return;
    const timer = setTimeout(() => setGone(true), CONFIRMATION_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [ok]);
  if (gone) return null;
  return (
    <div
      role={ok ? "status" : "alert"}
      data-tone={ok ? "ok" : "error"}
      className="form-message flex items-center gap-3 rounded-lg bg-surface p-3 font-medium shadow-sm"
    >
      <span aria-hidden="true" className={`form-message-badge grid size-8 flex-none place-items-center rounded-full ${ok ? "bg-success text-on-success" : "bg-danger text-on-danger"}`}>
        <svg viewBox="0 0 24 24" className="size-5 fill-none stroke-current" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path className="form-message-draw" d={ok ? "M5 12.5l4.5 4.5L19 7.5" : "M12 6v7M12 18v.5"} />
        </svg>
      </span>
      <span className="form-message-text">{children}</span>
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
