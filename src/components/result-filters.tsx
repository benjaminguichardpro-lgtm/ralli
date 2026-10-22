import Link from "next/link";
import { RESULT_FILTERS, type ResultFilterKey } from "@/lib/predictions/results";

function rallisHref(filter: ResultFilterKey, q: string) {
  const params = new URLSearchParams();
  if (filter !== "tous") params.set("statut", filter);
  if (q) params.set("q", q);
  const qs = params.toString();
  return qs ? `/rallis?${qs}` : "/rallis";
}

/** Puces de filtre des rallis terminés : des liens (le choix reste dans l'adresse), avec le nombre de rallis. */
export function ResultFilters({ current, counts, q = "" }: { current: ResultFilterKey; counts: Record<ResultFilterKey, number>; q?: string }) {
  return (
    <nav aria-label="Filtrer les rallis" data-testid="result-filters">
      <ul className="flex flex-wrap gap-2">
        {RESULT_FILTERS.map((f) => {
          const on = f.key === current;
          return (
            <li key={f.key}>
              <Link
                href={rallisHref(f.key, q)}
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
