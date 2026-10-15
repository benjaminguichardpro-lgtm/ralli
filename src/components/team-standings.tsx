import Link from "next/link";
import { seasonLabel } from "@/lib/standings/teams";
import type { TeamStandings } from "@/server/team-standings";

/** Tableau du classement des équipes. `seasonHref` : adresse d'une saison (absent = pas de choix de saison). */
export function TeamStandingsTable({ data, seasonHref, testId = "team-standings" }: { data: TeamStandings; seasonHref?: (year: number) => string; testId?: string }) {
  const { rows, years, year } = data;
  return (
    <div className="space-y-3" data-testid={testId}>
      {seasonHref && years.length > 1 && (
        <nav aria-label="Choisir la saison" data-testid="standings-seasons">
          <ul className="flex flex-wrap gap-2">
            {years.map((y) => (
              <li key={y}>
                <Link
                  href={seasonHref(y)}
                  scroll={false}
                  aria-current={y === year ? "true" : undefined}
                  className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold ${y === year ? "border-primary bg-primary text-on-primary" : "border-line bg-surface text-primary"}`}
                >
                  {seasonLabel(y)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
      {rows.length === 0 ? (
        <p className="text-ink-muted">Aucune équipe pour l&apos;instant.</p>
      ) : (
        <table className="w-full text-sm">
          <caption className="sr-only">Classement des équipes, saison {seasonLabel(year)}</caption>
          <thead>
            <tr className="text-left text-ink-muted">
              <th scope="col" className="py-2 pr-2 font-medium">#</th>
              <th scope="col" className="py-2 pr-2 font-medium">Équipe</th>
              <th scope="col" className="py-2 pr-2 text-right font-medium"><abbr title="Rencontres jouées">J</abbr></th>
              <th scope="col" className="hidden py-2 pr-2 text-right font-medium sm:table-cell"><abbr title="Victoires">V</abbr></th>
              <th scope="col" className="hidden py-2 pr-2 text-right font-medium sm:table-cell"><abbr title="Nuls">N</abbr></th>
              <th scope="col" className="hidden py-2 pr-2 text-right font-medium sm:table-cell"><abbr title="Défaites">D</abbr></th>
              <th scope="col" className="hidden py-2 pr-2 text-right font-medium sm:table-cell"><abbr title="Différence de points de match">Diff</abbr></th>
              <th scope="col" className="py-2 text-right font-medium"><abbr title="Points au classement">Pts</abbr></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.teamId} data-testid="standing-row">
                <td className="py-2 pr-2 font-semibold text-primary">{r.rank}</td>
                <td className="py-2 pr-2 font-medium text-ink">{r.name}</td>
                <td className="py-2 pr-2 text-right">{r.played}</td>
                <td className="hidden py-2 pr-2 text-right sm:table-cell">{r.won}</td>
                <td className="hidden py-2 pr-2 text-right sm:table-cell">{r.drawn}</td>
                <td className="hidden py-2 pr-2 text-right sm:table-cell">{r.lost}</td>
                <td className="hidden py-2 pr-2 text-right sm:table-cell">{r.diff > 0 ? `+${r.diff}` : r.diff}</td>
                <td className="py-2 text-right font-semibold text-primary">{r.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-xs text-ink-muted">Victoire 3 points, nul 1, défaite 0. Seules les rencontres confirmées comptent.</p>
    </div>
  );
}
