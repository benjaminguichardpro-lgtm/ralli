import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AddClubPlayerForm, AddToTeamForm, DeleteClubPlayerForm, EditClubPlayerForm, ImportPlayersPanel } from "@/components/club-player-forms";
import { requireUser } from "@/lib/auth/current-user";
import { formatBirth } from "@/lib/players/birth";
import { filterPlayers } from "@/lib/players/search";
import { DomainError } from "@/server/errors";
import { type ClubPlayerRow, listClubPlayers } from "@/server/club-players";
import { listClubTeams } from "@/server/teams";

export const metadata: Metadata = { title: "Joueurs du club · Ralli" };

/** Nombre de joueurs affichés d'un coup : au-delà, la recherche sert à retrouver les autres. */
const SHOWN = 200;

export default function ClubPlayersPage({ params, searchParams }: { params: Promise<{ clubId: string }>; searchParams: Promise<{ q?: string | string[] }> }) {
  return (
    <section className="space-y-6">
      <Suspense fallback={<p className="text-ink-muted">Chargement…</p>}>
        <Content params={params} searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function Content({ params, searchParams }: { params: Promise<{ clubId: string }>; searchParams: Promise<{ q?: string | string[] }> }) {
  const user = await requireUser();
  const { clubId } = await params;
  const sp = await searchParams;
  const query = (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.slice(0, 80) ?? "";
  let players: ClubPlayerRow[];
  try {
    players = await listClubPlayers(user.id, clubId);
  } catch (e) {
    // Réservé aux admins du club : un membre ou un inconnu reçoit la même réponse.
    if (e instanceof DomainError) notFound();
    throw e;
  }
  const clubTeams = (await listClubTeams(user.id, clubId)).filter((t) => t.kind === "CLUB");
  const matching = filterPlayers(players, query);
  const shown = matching.slice(0, SHOWN);

  return (
    <>
      <Link href={`/clubs/${clubId}`} className="inline-flex min-h-11 items-center font-semibold text-primary">
        ‹ Retour au club
      </Link>
      <h1 className="font-serif text-3xl text-primary">Joueurs du club</h1>
      <p className="text-ink-muted">
        Les joueurs du club, avec leur classement et leur date de naissance (facultative). Seuls les admins voient la date de naissance. Place ensuite chaque joueur dans une équipe.
      </p>

      <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm" data-testid="import-section">
        <h2 className="font-serif text-xl text-primary">Importer un fichier</h2>
        <p className="text-sm text-ink-muted">
          Pour inscrire d&apos;un coup tous les joueurs du club : un fichier Excel (.xlsx) ou CSV.{" "}
          <a href="/api/modele-joueurs/xlsx" download className="font-semibold text-primary underline" data-testid="template-link">
            Télécharger le modèle Excel
          </a>{" "}
          ou{" "}
          <a href="/api/modele-joueurs" download className="font-semibold text-primary underline" data-testid="template-csv-link">
            le modèle CSV
          </a>
          .
        </p>
        <p className="text-sm text-ink-muted" data-testid="rank-hint">
          Écris le classement tel quel (30/2, 15/4, NC…). Si ton tableur le transforme en nombre ou en date (30/2 devient 15), mets la colonne en format « Texte » : le modèle Excel est déjà réglé ainsi.
        </p>
        <ImportPlayersPanel clubId={clubId} />
      </div>

      <details className="rounded-2xl bg-surface p-4 shadow-sm" data-testid="add-player-section">
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-serif text-xl text-primary">Ajouter un joueur</summary>
        <div className="pt-2">
          <AddClubPlayerForm clubId={clubId} />
        </div>
      </details>

      <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm" data-testid="club-players">
        <h2 className="font-serif text-xl text-primary">
          Liste{" "}
          <span className="text-ink-muted" data-testid="players-count">
            ({query ? `${matching.length} sur ${players.length}` : players.length})
          </span>
        </h2>
        <form action={`/clubs/${clubId}/joueurs`} method="get" role="search" className="flex gap-2" data-testid="player-search">
          <label htmlFor="player-q" className="sr-only">
            Rechercher un joueur
          </label>
          <input
            id="player-q"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Rechercher un joueur (nom, classement, équipe)"
            autoComplete="off"
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-ink-muted bg-surface px-3 text-ink focus-visible:outline-2 focus-visible:outline-primary"
          />
          <button type="submit" className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 font-semibold text-on-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            Chercher
          </button>
        </form>
        {query && (
          <Link href={`/clubs/${clubId}/joueurs`} className="inline-flex min-h-11 items-center font-semibold text-primary underline" data-testid="player-search-clear">
            Effacer la recherche
          </Link>
        )}
        {players.length === 0 ? (
          <p className="text-ink-muted">Aucun joueur pour l&apos;instant : ajoute-en un ou importe un fichier.</p>
        ) : matching.length === 0 ? (
          <p className="text-ink-muted" data-testid="player-search-empty">
            Aucun joueur ne correspond à « {query} ».
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {shown.map((p) => {
              const inTeams = new Set(p.teams.map((t) => t.id));
              return (
                <li key={p.id} data-testid="club-player" data-name={`${p.firstName} ${p.lastName}`}>
                  <details>
                    <summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                      <span className="font-medium">
                        {p.firstName} {p.lastName}
                        {p.age !== null && <span className="font-normal text-ink-muted"> · {p.age} ans</span>}
                      </span>
                      <span className="text-sm text-ink-muted">
                        <span data-testid="player-rank">{p.rankLabel}</span>
                        {p.teams.length > 0 ? ` · ${p.teams.map((t) => t.name).join(", ")}` : " · sans équipe"}
                        {p.account && ` · compte ${p.account}`}
                      </span>
                    </summary>
                    <div className="space-y-4 pb-4 pt-2">
                      <EditClubPlayerForm
                        playerId={p.id}
                        initial={{ firstName: p.firstName, lastName: p.lastName, fftRank: p.fftRank, birthDate: p.birthDate ? p.birthDate.toISOString().slice(0, 10) : "" }}
                      />
                      {p.birthDate && <p className="text-sm text-ink-muted">Né(e) le {formatBirth(p.birthDate)}.</p>}
                      <AddToTeamForm playerId={p.id} teams={clubTeams.filter((t) => !inTeams.has(t.id)).map((t) => ({ id: t.id, name: t.name }))} />
                      {p.deletable && <DeleteClubPlayerForm playerId={p.id} name={`${p.firstName} ${p.lastName}`} />}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
        {matching.length > shown.length && (
          <p className="text-sm text-ink-muted" data-testid="player-search-more">
            {shown.length} premiers joueurs affichés sur {matching.length} : utilise la recherche pour retrouver les autres.
          </p>
        )}
      </div>
    </>
  );
}
