import Link from "next/link";
import { type EncounterResult, resultBadgeText } from "@/lib/encounters/filters";
import type { EncounterListItem } from "@/server/encounters";
import { formatParis } from "@/lib/time";
import { ArchiveEncounterButton, UnarchiveEncounterButton } from "./archive-forms";

/** Badge de statut : couleurs du thème uniquement. */
export function StatusBadge({ status, label, onDark = false }: { status: EncounterListItem["status"]; label: string; onDark?: boolean }) {
  const style = onDark && status !== "OPEN"
    ? "bg-surface text-primary"
    : status === "OPEN"
      ? "bg-success text-on-success"
      : status === "DRAFT" || status === "CANCELLED"
        ? "bg-pale text-ink"
        : "bg-primary text-on-primary";
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${style}`}>{label}</span>;
}

/** `archives` : la liste montre des rencontres archivées (bouton « Désarchiver » au lieu de la croix rouge). */
/** Badge de résultat d'une rencontre terminée : victoire (vert), défaite (rouge), nul (neutre). Le texte porte aussi le sens, pas seulement la couleur. */
export function ResultBadge({ result }: { result: EncounterResult }) {
  // Un score provisoire n'est ni une victoire ni une défaite tant qu'il n'est pas confirmé : badge neutre, bordé.
  const style = result.provisional
    ? "border border-accent bg-pale text-ink"
    : result.kind === "WIN"
      ? "bg-success text-on-success"
      : result.kind === "LOSS"
        ? "bg-danger text-on-danger"
        : "bg-pale text-ink";
  return (
    <span data-testid="result-badge" className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${style}`}>
      {resultBadgeText(result)}
    </span>
  );
}

export function EncounterList({ items, empty, archives = false }: { items: EncounterListItem[]; empty: string; archives?: boolean }) {
  if (items.length === 0) return <p className="text-ink-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line" data-testid="encounter-list">
      {items.map((e) => (
        // Toute la ligne est cliquable (le lien du titre s'étend sur elle) ; la croix passe au-dessus, alignée avec le statut.
        <li key={e.id} className="relative space-y-1 py-2">
          <Link href={`/rencontres/${e.id}`} className="block font-medium text-primary after:absolute after:inset-0">
            {e.home} – {e.away}
          </Link>
          <div className={`flex items-center justify-between gap-2 ${e.canArchive ? "min-h-11" : ""}`}>
            {e.result ? <ResultBadge result={e.result} /> : <StatusBadge status={e.status} label={e.statusLabel} />}
            {e.canArchive && (
              <span className="relative z-10">
                {archives ? (
                  <UnarchiveEncounterButton encounterId={e.id} label={`${e.home} – ${e.away}`} />
                ) : (
                  <ArchiveEncounterButton encounterId={e.id} label={`${e.home} – ${e.away}`} />
                )}
              </span>
            )}
          </div>
          <p className="text-sm text-ink-muted">
            {formatParis(e.startsAt)} · {e.matchCount} match{e.matchCount > 1 ? "s" : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}
