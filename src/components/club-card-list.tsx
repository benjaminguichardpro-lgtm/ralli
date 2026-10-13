import Link from "next/link";
import { followersLabel } from "@/lib/clubs/map";
import { type ClubCard } from "@/server/club-directory";
import { ClubLogo } from "./club-logo";

/** Résultats de recherche : une carte par club (logo, nom, ville, compteur), qui mène à la page du club. */
export function ClubCardList({ clubs, empty }: { clubs: ClubCard[]; empty: string }) {
  if (clubs.length === 0) return <p className="text-ink-muted">{empty}</p>;
  return (
    <ul className="space-y-3" data-testid="club-results">
      {clubs.map((c) => (
        <li key={c.id}>
          <Link
            href={`/clubs/${c.id}`}
            data-testid="club-result"
            className="flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <ClubLogo club={c} size={56} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-serif text-xl text-primary">{c.name}</span>
              {(c.city || c.postalCode) && <span className="block truncate text-sm text-ink-muted">{[c.postalCode, c.city].filter(Boolean).join(" ")}</span>}
              <span className="block text-sm text-ink-muted" data-testid="club-followers">
                {followersLabel(c.followers)}
              </span>
            </span>
            {c.isMember && <span className="shrink-0 rounded-full bg-pale px-2.5 py-1 text-xs font-bold text-primary">Membre</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export { followersLabel };
