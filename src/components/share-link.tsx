"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

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

/** Copie l'adresse complète d'une page (domaine + chemin) dans le presse-papiers ; le bouton confirme pendant 3 secondes. */
export function CopyLinkButton({ path, label = "Copier le lien", className = "" }: { path: string; label?: string; className?: string }) {
  const base = useSyncExternalStore(subscribe, origin, () => "");
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    if (state === "idle") return;
    const t = setTimeout(() => setState("idle"), 3000);
    return () => clearTimeout(t);
  }, [state]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${base}${path}`);
      setState("copied");
    } catch {
      setState("failed");
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      data-testid="copy-link"
      className={`inline-flex min-h-11 items-center gap-2 rounded-lg border border-primary bg-surface px-4 text-sm font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${className}`}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="9" width="11" height="11" rx="2" />
        <path d="M5 15V6a2 2 0 0 1 2-2h9" />
      </svg>
      <span role="status">{state === "copied" ? "Lien copié ✓" : state === "failed" ? "Copie impossible" : label}</span>
    </button>
  );
}
