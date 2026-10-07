"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { useFormStatus } from "react-dom";

// Composants d'interface partagés. Couleurs : uniquement via les tokens du thème (globals.css).

const base =
  "inline-flex min-h-11 items-center justify-center rounded-lg px-4 font-semibold transition-opacity disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const variants = {
  primary: "bg-primary text-on-primary",
  secondary: "bg-accent text-on-accent",
  ghost: "border border-primary bg-surface text-primary",
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
  ...input
}: { label: string; name: string; error?: string; hint?: string } & ComponentProps<"input">) {
  const id = `f-${name}`;
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="block min-h-11 w-full rounded-lg border border-ink-muted bg-surface px-3 text-ink focus-visible:outline-2 focus-visible:outline-primary"
        {...input}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="text-sm text-ink-muted">
          {hint}
        </p>
      )}
      {error && <FieldError id={`${id}-err`}>{error}</FieldError>}
    </div>
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
