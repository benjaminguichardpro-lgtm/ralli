import Link from "next/link";
import { RESULT_FILTERS, type ResultFilterKey } from "@/lib/predictions/results";

/** Puces de filtre des rallis terminés : des liens (le choix reste dans l'adresse), avec le nombre de rallis. */
export function ResultFilters({ current, counts }: { current: ResultFilterKey; counts: Record<ResultFilterKey, number> }) {
  return (
    <nav aria-label="Filtrer les rallis" data-testid="result-filters">
      <ul className="flex flex-wrap gap-2">
        {RESULT_FILTERS.map((f) => {
          const on = f.key === current;
          return (
            <li key={f.key}>
              <Link
                href={f.key === "tous" ? "/resultats" : `/resultats?statut=${f.key}`}
                scroll={false}
                aria-current={on ? "true" : undefined}
                data-testid={`result-filter-${f.key}`}
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
