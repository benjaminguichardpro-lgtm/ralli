import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ClubLogo } from "@/components/club-logo";
import { EncounterList } from "@/components/encounter-list";
import { TournamentList } from "@/components/tournament-list";
import { WhatsAppShare } from "@/components/share-link";
import { getCurrentUser } from "@/lib/auth/current-user";
import { formatAddress, formatCount, websiteLabel } from "@/lib/clubs/profile";
import { publicPath } from "@/lib/clubs/slug";
import { getPublicClub, getPublicClubEncounters } from "@/server/club-public";
import { listClubTournaments } from "@/server/tournaments";

// Page publique d'un club, sans compte. Indexable (l'admin l'a activée) ; le titre porte le nom du club (balise <title> dans la page).
export const metadata: Metadata = { title: "Club de tennis · Ralli", description: "Résultats et prochaines rencontres du club sur Ralli." };

export default function PublicClubPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<p className="text-ink-muted">Chargement…</p>}>
      <PublicClub params={params} />
    </Suspense>
  );
}

async function PublicClub({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const club = await getPublicClub(slug);
  if (!club) notFound();
  const [{ upcoming, recent }, viewer, tournaments] = await Promise.all([getPublicClubEncounters(club.id), getCurrentUser(), listClubTournaments(club.id)]);
  const address = formatAddress(club);
  const facts = [
    club.foundedYear !== null && `Fondé en ${club.foundedYear}`,
    club.licenseeCount !== null && `${formatCount(club.licenseeCount)} licencié${club.licenseeCount > 1 ? "s" : ""}`,
    club.indoorCourts !== null && `${club.indoorCourts} court${club.indoorCourts > 1 ? "s" : ""} intérieur${club.indoorCourts > 1 ? "s" : ""}`,
    club.outdoorCourts !== null && `${club.outdoorCourts} court${club.outdoorCourts > 1 ? "s" : ""} extérieur${club.outdoorCourts > 1 ? "s" : ""}`,
  ].filter((f): f is string => Boolean(f));

  return (
    <section className="space-y-6" data-testid="public-club">
      <title>{`${club.name} · résultats et rencontres · Ralli`}</title>
      <div className="space-y-3">
        <div className="flex items-center gap-4">
          <ClubLogo club={club} size={80} />
          <div className="min-w-0">
            <h1 className="font-serif text-3xl text-primary" data-testid="public-club-name">{club.name}</h1>
            {club.city && <p className="text-ink-muted">{club.city}</p>}
          </div>
        </div>
        {(facts.length > 0 || address || club.websiteUrl) && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted" data-testid="public-club-facts">
            {facts.map((f) => <li key={f}>{f}</li>)}
            {address && <li>{address}</li>}
            {club.websiteUrl && (
              <li>
                <a href={club.websiteUrl} target="_blank" rel="noopener noreferrer" className="break-all text-primary underline">
                  {websiteLabel(club.websiteUrl)}
                </a>
              </li>
            )}
          </ul>
        )}
        <div className="flex flex-wrap gap-3">
          {viewer ? (
            <Link href={`/clubs/${club.id}`} className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 font-semibold text-on-primary" data-testid="public-club-cta">
              Voir le club dans Ralli
            </Link>
          ) : (
            <Link href="/inscription" className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 font-semibold text-on-primary" data-testid="public-club-cta">
              Rejoindre Ralli pour pronostiquer
            </Link>
          )}
          <WhatsAppShare text={`${club.name} sur Ralli :`} path={publicPath(club.slug)} label="Partager" />
        </div>
      </div>

      {tournaments.length > 0 && (
        <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm" data-testid="public-tournaments">
          <h2 className="font-serif text-xl text-primary">Tournois</h2>
          <TournamentList items={tournaments} empty="" />
        </div>
      )}

      <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm" data-testid="public-results">
        <h2 className="font-serif text-xl text-primary">Résultats</h2>
        <EncounterList items={recent} empty="Pas encore de résultat." />
      </div>

      <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm" data-testid="public-upcoming">
        <h2 className="font-serif text-xl text-primary">Rencontres à venir</h2>
        <EncounterList items={upcoming} empty="Aucune rencontre à venir pour l'instant." />
      </div>

      {club.teams.length > 0 && (
        <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm" data-testid="public-teams">
          <h2 className="font-serif text-xl text-primary">Équipes</h2>
          <ul className="flex flex-wrap gap-2">
            {club.teams.map((t) => (
              <li key={t.id} className="rounded-full bg-pale px-3 py-1 text-sm font-medium">{t.name}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
