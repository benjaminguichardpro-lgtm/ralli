import Link from "next/link";
import { FILTERS, type FilterKey } from "@/lib/encounters/filters";

/** Puces de filtre de la liste des rencontres : des liens (le choix reste dans l'adresse), avec le nombre de rencontres. */
export function EncounterFilters({ clubId, current, counts }: { clubId: string; current: FilterKey; counts: Record<FilterKey, number> }) {
  return (
    <nav aria-label="Filtrer les rencontres" data-testid="encounter-filters">
      <ul className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const on = f.key === current;
          return (
            <li key={f.key}>
              <Link
                href={f.key === "toutes" ? `/clubs/${clubId}` : `/clubs/${clubId}?statut=${f.key}`}
                scroll={false}
                aria-current={on ? "true" : undefined}
                data-testid={`filter-${f.key}`}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                  on ? "border-primary bg-primary text-on-primary" : "border-line bg-surface text-primary"
                }`}
              >
                {f.label}{" "}
                <span className={`font-data text-xs ${on ? "text-on-primary-soft" : "text-ink-muted"}`}>{counts[f.key]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
