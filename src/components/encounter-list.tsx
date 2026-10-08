import Link from "next/link";
import type { EncounterListItem } from "@/server/encounters";
import { formatParis } from "@/lib/time";

/** Badge de statut : couleurs du thème uniquement. */
export function StatusBadge({ status, label, onDark = false }: { status: EncounterListItem["status"]; label: string; onDark?: boolean }) {
  const style = onDark && status !== "OPEN"
    ? "bg-surface text-primary"
    : status === "OPEN"
      ? "bg-success text-on-success"
      : status === "DRAFT" || status === "CANCELLED"
        ? "bg-canvas text-ink"
        : "bg-primary text-on-primary";
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${style}`}>{label}</span>;
}

export function EncounterList({ items, empty }: { items: EncounterListItem[]; empty: string }) {
  if (items.length === 0) return <p className="text-ink-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line" data-testid="encounter-list">
      {items.map((e) => (
        <li key={e.id}>
          <Link href={`/rencontres/${e.id}`} className="block min-h-11 space-y-1 py-2">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-primary">
                {e.home} – {e.away}
              </span>
              <StatusBadge status={e.status} label={e.statusLabel} />
            </span>
            <span className="block text-sm text-ink-muted">
              {formatParis(e.startsAt)} · {e.matchCount} match{e.matchCount > 1 ? "s" : ""}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
