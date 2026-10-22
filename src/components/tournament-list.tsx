import Link from "next/link";
import { formatDistance } from "@/lib/geo";
import { formatParisDay } from "@/lib/time";
import type { TournamentCard } from "@/server/tournaments";

/** Tournois sous forme de liste de cartes : nom, club (si demandé), date, état. Toute la carte mène à la page du tournoi. */
export type TournamentListItem = TournamentCard & { distanceKm?: number | null; isMember?: boolean };

export function TournamentList({ items, empty, showClub = false }: { items: TournamentListItem[]; empty: string; showClub?: boolean }) {
  if (items.length === 0) return empty ? <p className="text-ink-muted">{empty}</p> : null;
  return (
    <ul className="divide-y divide-line" data-testid="tournament-list">
      {items.map((t) => (
        <li key={t.id}>
          <Link href={`/tournois/${t.id}`} data-testid="tournament-card" className="block space-y-1 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            <span className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="font-semibold">{t.name}</span>
              <span className="text-sm text-ink-muted">{formatParisDay(t.startsAt)}</span>
            </span>
            <span className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
              <span className="rounded-full bg-pale px-2 py-0.5 text-xs font-semibold text-ink">{t.statusLabel}</span>
              {showClub && <span>{t.clubName}</span>}
              {t.distanceKm != null && <span data-testid="tournament-distance">{formatDistance(t.distanceKm)}</span>}
              {t.isMember && <span className="rounded-full bg-pale px-2.5 py-0.5 text-xs font-bold text-primary">Membre</span>}
              <span>{t.drawSize} joueurs</span>
              {t.status === "OPEN" && t.openMatches > 0 && (
                <span className="font-semibold text-primary" data-testid="open-matches">
                  {t.openMatches} match{t.openMatches > 1 ? "s" : ""} à pronostiquer
                </span>
              )}
              {t.status === "FINISHED" && t.winner && <span className="font-semibold text-primary">Vainqueur : {t.winner}</span>}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
