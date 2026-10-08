import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AddExistingPlayerForm, AddPlayerForm, CaptainForm, ManagePlayer } from "@/components/team-forms";
import { requireUser } from "@/lib/auth/current-user";
import { fftLabel } from "@/lib/fft";
import { DomainError } from "@/server/errors";
import { type TeamView, getTeamView } from "@/server/teams";

export const metadata: Metadata = { title: "Équipe · Ralli" };

export default function TeamPage({ params }: { params: Promise<{ teamId: string }> }) {
  return (
    <Suspense fallback={<p className="text-ink-muted">Chargement…</p>}>
      <Team params={params} />
    </Suspense>
  );
}

async function Team({ params }: { params: Promise<{ teamId: string }> }) {
  const user = await requireUser();
  const { teamId } = await params;
  let team: TeamView;
  try {
    team = await getTeamView(user.id, teamId);
  } catch (e) {
    if (e instanceof DomainError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const isExternal = team.kind === "EXTERNAL";

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <Link href={`/clubs/${team.clubId}`} className="inline-flex min-h-11 items-center font-semibold text-primary underline">
          ← {team.clubName}
        </Link>
        <h1 className="font-serif text-3xl text-primary">{team.name}</h1>
        {isExternal ? (
          <p className="text-ink-muted">Équipe adverse · {team.externalClubName} (hors Ralli)</p>
        ) : (
          <p className="text-ink-muted">
            Capitaine : <span data-testid="captain">{team.captain?.displayName ?? "aucun"}</span>
          </p>
        )}
      </div>

      {team.isAdmin && !isExternal && (
        <div className="rounded-2xl bg-surface p-4 shadow-sm">
          <CaptainForm teamId={team.id} captainUserId={team.captain?.userId} members={team.members} />
        </div>
      )}

      <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
        <h2 className="font-serif text-xl text-primary">Effectif ({team.players.length})</h2>
        {team.players.length === 0 ? (
          <p className="text-ink-muted">Aucun joueur pour l&apos;instant.</p>
        ) : (
          <ul className="divide-y divide-line" data-testid="roster">
            {team.players.map((p) => (
              <li key={p.id} className="py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {p.firstName} {p.lastName}
                  </span>
                  <span data-testid="rank" className="rounded-full bg-pale px-2 py-0.5 text-sm font-semibold text-ink">{fftLabel(p.fftRank)}</span>
                </div>
                {p.account && <p className="text-sm text-ink-muted">Compte : {p.account.displayName}</p>}
                {team.canManage && (
                  <details className="mt-1">
                    <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-primary">
                      Gérer {p.firstName}
                    </summary>
                    <ManagePlayer teamId={team.id} player={p} members={team.members} canLinkAccount={!isExternal} />
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {team.canManage && (
        <div data-testid="add-player" className="space-y-4 rounded-2xl bg-surface p-4 shadow-sm">
          <h2 className="font-serif text-xl text-primary">Ajouter un joueur</h2>
          <AddPlayerForm teamId={team.id} />
          {team.addablePlayers.length > 0 && (
            <>
              <hr className="border-line" />
              <AddExistingPlayerForm
                teamId={team.id}
                players={team.addablePlayers.map((p) => ({ ...p, rankLabel: fftLabel(p.fftRank) }))}
              />
            </>
          )}
        </div>
      )}
    </section>
  );
}
