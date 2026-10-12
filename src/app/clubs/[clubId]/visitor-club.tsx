import Link from "next/link";
import { notFound } from "next/navigation";
import { followersLabel } from "@/components/club-card-list";
import { ClubLogo } from "@/components/club-logo";
import { JoinClubButton, ReturnRequestButton } from "@/components/club-directory";
import { EncounterList } from "@/components/encounter-list";
import { StoriesSection } from "@/components/stories-section";
import { formatCount, isProfileEmpty, websiteLabel } from "@/lib/clubs/profile";
import { db } from "@/lib/db";
import { countFollowers, getMyRemoval } from "@/server/club-directory";
import { listPublicClubEncounters } from "@/server/encounters";
import { getClubProfile } from "@/server/club-profile";


/**
 * Page d'un club pour un compte qui n'en est pas membre : tous les clubs sont publics. On consulte la fiche, « à la une »,
 * les rencontres à venir (avec leurs matchs et leurs cotes) et les résultats récents ; on rejoint d'un bouton pour pronostiquer.
 * Rien d'autre : ni membres, ni classement, ni stories (réservées aux membres).
 */
export async function VisitorClub({ userId, clubId }: { userId: string; clubId: string }) {
  const [club, followers, { upcoming, recent }, teams, removal] = await Promise.all([
    getClubProfile(userId, clubId).catch(() => null),
    countFollowers(clubId),
    listPublicClubEncounters(clubId),
    db.team.findMany({ where: { clubId, kind: "CLUB" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getMyRemoval(userId, clubId),
  ]);
  if (!club) notFound();
  return (
    <section className="space-y-6" data-testid="visitor-club">
      <div className="space-y-3" data-testid="club-header">
        <div className="flex items-center gap-4">
          <ClubLogo club={club} size={72} />
          <div className="min-w-0">
            <h1 className="font-serif text-3xl text-primary">{club.name}</h1>
            <p className="text-ink-muted" data-testid="club-followers">
              {followersLabel(followers)}
            </p>
          </div>
        </div>
        {!isProfileEmpty(club) && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
            {club.city && <li>{club.city}</li>}
            {club.licenseeCount !== null && <li>{formatCount(club.licenseeCount)} licencié{club.licenseeCount > 1 ? "s" : ""}</li>}
            {club.websiteUrl && (
              <li>
                <a href={club.websiteUrl} target="_blank" rel="noopener noreferrer" className="break-all text-primary underline">
                  {websiteLabel(club.websiteUrl)}
                </a>
              </li>
            )}
          </ul>
        )}
        {removal ? (
          <ReturnRequestButton clubId={club.id} pending={removal.requestedAt !== null} />
        ) : (
          <>
            <JoinClubButton clubId={club.id} />
            <p className="text-sm text-ink-muted">Rejoins le club pour pronostiquer ses rencontres.</p>
          </>
        )}
        {!isProfileEmpty(club) && (
          <Link href={`/clubs/${club.id}/fiche`} className="inline-flex min-h-11 items-center font-semibold text-primary underline">
            Voir la fiche du club
          </Link>
        )}
      </div>

      <StoriesSection userId={userId} clubId={clubId} clubName={club.name} />

      <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm" data-testid="visitor-upcoming">
        <h2 className="font-serif text-xl text-primary">Rencontres à venir</h2>
        <EncounterList items={upcoming} empty="Aucune rencontre à venir pour l'instant." />
      </div>

      {recent.length > 0 && (
        <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm" data-testid="visitor-recent">
          <h2 className="font-serif text-xl text-primary">Résultats récents</h2>
          <EncounterList items={recent} empty="" />
        </div>
      )}

      {teams.length > 0 && (
        <details className="rounded-2xl bg-surface p-4 shadow-sm" data-testid="section-teams">
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-serif text-xl text-primary">Équipes du club ({teams.length})</summary>
          <ul className="divide-y divide-line pt-2">
            {teams.map((t) => (
              <li key={t.id} className="flex min-h-11 items-center py-2 font-medium">
                {t.name}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
