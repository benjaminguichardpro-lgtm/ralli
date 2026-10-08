"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const origin = () => window.location.origin;

/**
 * Lien de partage WhatsApp. L'adresse complète de la page est lue dans le navigateur ;
 * avant l'hydratation, seul le texte est partagé.
 */
export function WhatsAppShare({ text, path, label = "Partager sur WhatsApp", className = "" }: { text: string; path: string; label?: string; className?: string }) {
  const base = useSyncExternalStore(subscribe, origin, () => "");
  const href = `https://wa.me/?text=${encodeURIComponent(`${text} ${base}${path}`)}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex min-h-11 items-center gap-2 rounded-lg border border-primary bg-surface px-4 text-sm font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${className}`}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 20l1.3-4.2A8 8 0 1 1 8.4 18.8L4 20z" />
      </svg>
      {label}
    </a>
  );
}
