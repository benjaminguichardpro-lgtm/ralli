import type { Metadata } from "next";
import { TeamStandingsTable } from "@/components/team-standings";
import { parseSeason, seasonYearOf } from "@/lib/standings/teams";
import { getTeamStandings } from "@/server/team-standings";
import Link from "next/link";
import { Suspense } from "react";
import { ResultCard } from "@/components/result-card";
import { ButtonLink } from "@/components/ui";
import { requireUser } from "@/lib/auth/current-user";
import { PAGE_SIZE, parseLimit } from "@/lib/predictions/results";
import { RESULTS_PAGE_SIZE, getResultsOptions, listResults } from "@/server/results-feed";

export const metadata: Metadata = { title: "Résultats · Ralli" };

type Props = { searchParams: Promise<{ club?: string | string[]; equipe?: string | string[]; limite?: string | string[]; saison?: string | string[] }> };

export default function ResultsPage(props: Props) {
  return (
    <section className="space-y-4">
      <h1 className="font-serif text-3xl text-primary">Résultats</h1>
      <Suspense fallback={<p className="text-ink-muted">Chargement…</p>}>
        <Results {...props} />
      </Suspense>
    </section>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Adresse de la page avec le club et l'équipe choisis (`?club=&equipe=`). */
function href(club: string | null, team: string | null, limit?: number): string {
  const sp = new URLSearchParams();
  if (club) sp.set("club", club);
  if (team) sp.set("equipe", team);
  if (limit && limit > RESULTS_PAGE_SIZE) sp.set("limite", String(limit));
  const qs = sp.toString();
  return qs ? `/resultats-clubs?${qs}` : "/resultats-clubs";
}

function Chip({ to, on, children, testId }: { to: string; on: boolean; children: React.ReactNode; testId: string }) {
  return (
    <Link
      href={to}
      scroll={false}
      aria-current={on ? "true" : undefined}
      data-testid={testId}
      className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
        on ? "border-primary bg-primary text-on-primary" : "border-line bg-surface text-primary"
      }`}
    >
      {children}
    </Link>
  );
}

async function Results({ searchParams }: Props) {
  const user = await requireUser();
  const sp = await searchParams;
  const options = await getResultsOptions(user.id);
  // Un club ou une équipe inconnus (ou d'un club dont on n'est pas membre) sont ignorés : on revient à « Tous ».
  const club = options.clubs.find((c) => c.id === one(sp.club)) ?? null;
  // Avec un seul club, ses équipes sont proposées d'emblée.
  const teamClub = club ?? (options.clubs.length === 1 ? options.clubs[0]! : null);
  const team = teamClub?.teams.find((t) => t.id === one(sp.equipe)) ?? null;
  const limit = parseLimit(sp.limite);
  const now = new Date();
  const standings = teamClub ? await getTeamStandings(teamClub.id, parseSeason(one(sp.saison), seasonYearOf(now)), now) : null;
  const { items, hasMore } = await listResults(user.id, { clubId: club?.id ?? teamClub?.id ?? null, teamId: team?.id ?? null, limit });

  if (options.clubs.length === 0) {
    return (
      <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm" data-testid="results-no-club">
        <p className="text-ink-muted">Tu n&apos;es membre d&apos;aucun club pour l&apos;instant. Rejoins le tien pour voir ses résultats.</p>
        <ButtonLink href="/clubs/recherche">Rechercher un club</ButtonLink>
      </div>
    );
  }
  return (
    <>
      {options.clubs.length > 1 && (
        <nav aria-label="Filtrer par club" data-testid="results-club-chips">
          <ul className="flex flex-wrap gap-2">
            <li>
              <Chip to={href(null, null)} on={!club} testId="results-club-all">
                Tous mes clubs
              </Chip>
            </li>
            {options.clubs.map((c) => (
              <li key={c.id}>
                <Chip to={href(c.id, null)} on={club?.id === c.id} testId="results-club-chip">
                  {c.name}
                </Chip>
              </li>
            ))}
          </ul>
        </nav>
      )}
      {teamClub && teamClub.teams.length > 1 && (
        <nav aria-label="Filtrer par équipe" data-testid="results-team-chips">
          <ul className="flex flex-wrap gap-2">
            <li>
              <Chip to={href(club?.id ?? null, null)} on={!team} testId="results-team-all">
                Toutes les équipes
              </Chip>
            </li>
            {teamClub.teams.map((t) => (
              <li key={t.id}>
                <Chip to={href(club?.id ?? null, t.id)} on={team?.id === t.id} testId="results-team-chip">
                  {t.name}
                </Chip>
              </li>
            ))}
          </ul>
        </nav>
      )}
      {teamClub && standings && (
        <details className="rounded-2xl bg-surface p-4 shadow-sm" data-testid="results-standings">
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-serif text-xl text-primary">Classement des équipes · {teamClub.name}</summary>
          <div className="pt-2">
            <TeamStandingsTable data={standings} seasonHref={(y) => `/resultats-clubs?club=${teamClub.id}&saison=${y}`} />
          </div>
        </details>
      )}
      {items.length === 0 ? (
        <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm" data-testid="results-empty">
          <p className="text-ink-muted">Aucun résultat pour l&apos;instant. Ils apparaissent ici dès qu&apos;un capitaine propose le score d&apos;une rencontre.</p>
          <ButtonLink href="/">Voir les rencontres à venir</ButtonLink>
        </div>
      ) : (
        <ul className="space-y-3" data-testid="results-list">
          {items.map((it) => (
            <li key={it.id}>
              <ResultCard item={it} showClub={options.clubs.length > 1} />
            </li>
          ))}
        </ul>
      )}
      {hasMore && (
        <div className="flex justify-center">
          <ButtonLink href={href(club?.id ?? null, team?.id ?? null, limit + PAGE_SIZE)} variant="ghost" className="min-w-48" scroll={false}>
            Voir plus
          </ButtonLink>
        </div>
      )}
    </>
  );
}
