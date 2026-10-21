import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TournamentPoster } from "@/components/tournament-poster";
import { getCurrentUser } from "@/lib/auth/current-user";
import { formatParisDay } from "@/lib/time";
import { DomainError } from "@/server/errors";
import { type PosterView, getTournamentPoster } from "@/server/tournament-poster";

// Affiche pour l'écran du club-house : lisible de tous pour un tournoi publié, jamais indexée.
export const metadata: Metadata = { title: "Affiche du tournoi · Ralli", robots: { index: false, follow: false } };

export default function PosterPage({ params }: { params: Promise<{ tournamentId: string }> }) {
  return (
    <Suspense fallback={<p className="text-ink-muted">Chargement…</p>}>
      <Poster params={params} />
    </Suspense>
  );
}

async function Poster({ params }: { params: Promise<{ tournamentId: string }> }) {
  const { tournamentId } = await params;
  const viewer = await getCurrentUser();
  let p: PosterView;
  try {
    p = await getTournamentPoster(viewer?.id ?? null, tournamentId);
  } catch (e) {
    if (e instanceof DomainError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  return (
    <section className="space-y-4" data-testid="poster-page">
      <Link href={`/tournois/${p.id}`} className="inline-flex min-h-11 items-center font-semibold text-primary underline">
        ‹ Retour au tournoi
      </Link>
      {p.isStaff && <p className="text-sm text-ink-muted">Pour modifier un joueur, une heure ou un score, retourne sur la page du tournoi : l&apos;affiche se met à jour toute seule.</p>}
      <TournamentPoster
        tournamentName={p.name}
        clubName={p.clubName}
        venue={p.venue}
        dateLabel={formatParisDay(p.startsAt)}
        heading={p.heading}
        rows={p.rows}
        tournamentPath={`/tournois/${p.id}`}
      />
    </section>
  );
}
