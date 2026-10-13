import Link from "next/link";
import { formatParisDay } from "@/lib/time";
import type { ResultItem } from "@/server/results-feed";
import { ClubLogo } from "./club-logo";
import { ResultBadge } from "./encounter-list";

/**
 * Un résultat : « Équipe A 4 – 2 Équipe B », le badge (Victoire, Défaite, Nul, ou Provisoire) et la date. Toute la carte mène
 * à la rencontre (le détail match par match). `showClub` : le logo du club s'affiche quand l'utilisateur a plusieurs clubs.
 */
export function ResultCard({ item, showClub }: { item: ResultItem; showClub: boolean }) {
  return (
    <Link
      href={`/rencontres/${item.id}`}
      data-testid="result-card"
      className="block space-y-2 rounded-2xl bg-surface p-4 shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <span className="flex items-center gap-2 font-semibold">
        {showClub && <ClubLogo club={item.club} size={28} />}
        <span className="min-w-0 flex-1">
          {item.home} <span className="font-data text-lg text-primary" data-testid="result-score">{item.homePoints} – {item.awayPoints}</span> {item.away}
        </span>
      </span>
      <span className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-muted">
        <ResultBadge result={item.result} />
        <span>{formatParisDay(item.startsAt)}</span>
      </span>
    </Link>
  );
}
