"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { normalizeSearch } from "@/lib/clubs/search";

const MAX = 6;

/** Suggestions : le texte tapé doit commencer un mot (prénom, nom, club…) de la suggestion. */
export type Suggestion = { label: string; detail: string };

export function suggest(all: Suggestion[], query: string): Suggestion[] {
  const q = normalizeSearch(query);
  if (!q) return [];
  return all
    .filter((s) => {
      const n = normalizeSearch(`${s.label} ${s.detail}`);
      return normalizeSearch(s.label) !== q && (n.startsWith(q) || n.includes(` ${q}`) || n.includes(`-${q}`));
    })
    .slice(0, MAX);
}

/** Barre de recherche de « Mes rallis » avec propositions pendant la saisie (un clic sur une proposition lance la recherche). */
export function RallisSearch({ q, filter, suggestions }: { q: string; filter: string; suggestions: Suggestion[] }) {
  const [value, setValue] = useState(q);
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const items = open ? suggest(suggestions, value) : [];

  return (
    <form ref={formRef} action="/rallis" role="search" className="relative flex gap-2" data-testid="rallis-search">
      {filter !== "tous" && <input type="hidden" name="statut" value={filter} />}
      <label htmlFor="rallis-q" className="sr-only">
        Rechercher un match
      </label>
      <input
        id="rallis-q"
        name="q"
        type="search"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        autoComplete="off"
        role="combobox"
        aria-expanded={items.length > 0}
        aria-controls="rallis-suggestions"
        placeholder="Rechercher un match (joueur, équipe, club)"
        className="min-h-11 min-w-0 flex-1 rounded-lg border border-ink-muted bg-surface px-3"
      />
      <button type="submit" className="min-h-11 rounded-lg bg-primary px-4 font-semibold text-on-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
        Chercher
      </button>
      {q && (
        <Link href={filter === "tous" ? "/rallis" : `/rallis?statut=${filter}`} className="inline-flex min-h-11 items-center px-2 font-semibold text-primary underline" data-testid="rallis-search-clear">
          Effacer
        </Link>
      )}
      {items.length > 0 && (
        <ul id="rallis-suggestions" role="listbox" className="absolute inset-x-0 top-12 z-20 overflow-hidden rounded-lg border border-line bg-surface shadow-lg" data-testid="rallis-suggestions">
          {items.map((s) => (
            <li key={`${s.label}|${s.detail}`} role="option" aria-selected="false">
              <button
                type="button"
                // mouseDown (et non click) : le champ perd le focus avant le click et fermerait la liste.
                onMouseDown={(e) => {
                  e.preventDefault();
                  setValue(s.label);
                  setOpen(false);
                  // Laisse React mettre à jour le champ avant d'envoyer le formulaire.
                  setTimeout(() => formRef.current?.requestSubmit(), 0);
                }}
                className="block min-h-11 w-full px-3 py-1.5 text-left hover:bg-pale focus-visible:bg-pale"
              >
                <span className="block font-medium">{s.label}</span>
                <span className="block text-sm text-ink-muted">{s.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
