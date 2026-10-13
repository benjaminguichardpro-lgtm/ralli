"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { REGIONS, isRegion } from "@/lib/clubs/region";
import { type ClubFilters, directoryHref } from "@/lib/clubs/search";
import { CLUB_SIZES, CLUB_SIZE_SHORT_LABELS, isClubSize } from "@/lib/clubs/size";

const SELECT = "min-h-11 w-full appearance-none truncate rounded-full border border-ink-muted bg-surface pl-4 pr-9 text-sm text-ink shadow-md";

/** Flèche des menus : dessinée ici (la flèche du navigateur colle au bord d'une pastille arrondie). Ne capte pas les touchers. */
function Chevron() {
  return (
    <svg aria-hidden="true" viewBox="0 0 12 12" className="pointer-events-none absolute right-3.5 top-1/2 size-3 -translate-y-1/2 text-ink" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4.5 6 8.5 10 4.5" />
    </svg>
  );
}

/**
 * Filtres en haut de la carte agrandie : région, taille, rencontre à venir. Ils s'appliquent dès qu'on change un choix
 * (l'adresse de la page est mise à jour, la recherche `q` est gardée), sans bouton « Appliquer ».
 */
export function ClubMapFilters({ q, filters }: { q: string; filters: ClubFilters }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const active = Boolean(filters.region || filters.size || filters.upcomingOnly);
  const go = (next: ClubFilters) => startTransition(() => router.replace(directoryHref("/clubs/carte", q, next), { scroll: false }));

  return (
    <div
      role="group"
      aria-label="Filtres de la carte"
      aria-busy={pending}
      data-testid="map-filters"
      className="absolute inset-x-2 top-2 z-10 flex flex-wrap items-center justify-center gap-2"
    >
      <label className="sr-only" htmlFor="map-filter-region">
        Région
      </label>
      <div className="relative w-36 shrink-0">
        <select id="map-filter-region" value={filters.region ?? ""} onChange={(e) => go({ ...filters, region: isRegion(e.target.value) ? e.target.value : null })} className={SELECT}>
          <option value="">Par région</option>
          {REGIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <Chevron />
      </div>
      <label className="sr-only" htmlFor="map-filter-size">
        Taille du club
      </label>
      <div className="relative w-32 shrink-0">
        <select id="map-filter-size" value={filters.size ?? ""} onChange={(e) => go({ ...filters, size: isClubSize(e.target.value) ? e.target.value : null })} className={SELECT}>
          <option value="">Par taille</option>
          {CLUB_SIZES.map((s) => (
            <option key={s} value={s}>
              {CLUB_SIZE_SHORT_LABELS[s]}
            </option>
          ))}
        </select>
        <Chevron />
      </div>
      <button
        type="button"
        aria-pressed={filters.upcomingOnly}
        onClick={() => go({ ...filters, upcomingOnly: !filters.upcomingOnly })}
        className={`min-h-11 rounded-full border px-4 text-sm font-semibold shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
          filters.upcomingOnly ? "border-primary bg-primary text-on-primary" : "border-ink-muted bg-surface text-ink"
        }`}
      >
        Rencontre à venir
      </button>
      {active && (
        <button type="button" onClick={() => go({ region: null, size: null, upcomingOnly: false })} className="min-h-11 rounded-full bg-surface px-4 text-sm font-semibold text-primary shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          Effacer
        </button>
      )}
    </div>
  );
}
