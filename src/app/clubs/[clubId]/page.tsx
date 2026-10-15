import type { Metadata } from "next";
import { TeamStandingsTable } from "@/components/team-standings";
import { parseSeason, seasonYearOf } from "@/lib/standings/teams";
import { getTeamStandings } from "@/server/team-standings";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { ClubLogo } from "@/components/club-logo";
import { MemberRoleForm, RemoveMemberForm, ReturnRequestForm } from "@/components/club-forms";
import { CopyLinkButton, WhatsAppShare } from "@/components/share-link";
import { ResetAvatarForm } from "@/components/profile-forms";
import { LeaderboardTable, RankMoveBadge } from "@/components/leaderboard";
import { rankLabel } from "@/lib/leaderboard/rank";
import { EncounterFilters } from "@/components/encounter-filters";
import { EncounterList } from "@/components/encounter-list";
import { CreateExternalTeamForm, CreateTeamForm } from "@/components/team-forms";
import { StoriesSection } from "@/components/stories-section";
import { TournamentList } from "@/components/tournament-list";
import { ButtonLink } from "@/components/ui";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { clubPath, parseClubParam } from "@/lib/clubs/invite-link";
import { formatCount, isProfileEmpty, websiteLabel } from "@/lib/clubs/profile";
import { applyFilter, countFilters, parseFilter } from "@/lib/encounters/filters";
import { publicPath } from "@/lib/clubs/slug";
import { getPublicPageSettings } from "@/server/club-public";
import { type ClubView, getClubView } from "@/server/clubs";
import { countFollowers, listReturnRequests } from "@/server/club-directory";
import { listPendingReports } from "@/server/win-cards";
import { ReportReview } from "@/components/win-card-reports";
import { followersLabel } from "@/components/club-card-list";
import { LeaveClubForm } from "@/components/club-directory";
import { VisitorClub } from "./visitor-club";
import { listArchivedEncounters, listClubEncounters } from "@/server/encounters";
import { listClubTournaments } from "@/server/tournaments";
import { DomainError } from "@/server/errors";
import { getLeaderboard } from "@/server/leaderboard";
import { getClubRole, isCaptainInClub } from "@/server/permissions";
import { listClubTeams } from "@/server/teams";

export const metadata: Metadata = { title: "Club · Ralli" };

// Équipes, adversaires et membres : sections repliées par défaut (le titre porte le nombre d'éléments).
const SECTION_SUMMARY = "inline-flex min-h-11 cursor-pointer items-center font-serif text-xl text-primary";

export default function ClubPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ statut?: string | string[]; saison?: string | string[] }>;
}) {
  return (
    <Suspense fallback={<p className="text-ink-muted">Chargement…</p>}>
      <Club params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Club({ params, searchParams }: { params: Promise<{ clubId: string }>; searchParams: Promise<{ statut?: string | string[]; saison?: string | string[] }> }) {
  const { clubId } = await params;
  const user = await getCurrentUser();
  // Lien partagé ouvert sans compte : on se connecte (ou s'inscrit), puis on revient sur ce club.
  if (!user) redirect(`/connexion${parseClubParam(clubId) ? `?club=${clubId}` : ""}`);
  if (user.mustChangePassword) redirect("/mot-de-passe");
  const sp = await searchParams;
  const filter = parseFilter(sp.statut);
  // Les clubs sont publics : un compte qui n'est pas membre consulte une page en lecture seule, avec « Rejoindre le club ».
  if ((await getClubRole(user.id, clubId)) === null) return <VisitorClub userId={user.id} clubId={clubId} />;
  let club: ClubView;
  try {
    club = await getClubView(user.id, clubId);
  } catch (e) {
    if (e instanceof DomainError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const now = new Date();
  const currentSeason = seasonYearOf(now);
  const seasonParam = Array.isArray(sp.saison) ? sp.saison[0] : sp.saison;
  const [followers, standings] = await Promise.all([countFollowers(club.id), getTeamStandings(club.id, parseSeason(seasonParam, currentSeason), now)]);
  const isAdmin = club.myRole === "ADMIN";
  const [teams, isCaptain, encounters, archived, board, returnRequests, pendingReports, publicSettings, tournaments] = await Promise.all([
    listClubTeams(user.id, club.id),
    isCaptainInClub(user.id, club.id),
    listClubEncounters(user.id, club.id),
    listArchivedEncounters(user.id, club.id),
    getLeaderboard(user.id, club.id, "season", { limit: 3 }),
    isAdmin ? listReturnRequests(user.id, club.id) : Promise.resolve([]),
    isAdmin ? listPendingReports(user.id, club.id) : Promise.resolve([]),
    isAdmin ? getPublicPageSettings(user.id, club.id) : Promise.resolve(null),
    listClubTournaments(club.id, { withDrafts: isAdmin }),
  ]);
  const clubTeams = teams.filter((t) => t.kind === "CLUB");
  const externalTeams = teams.filter((t) => t.kind === "EXTERNAL");

  return (
    <section className="space-y-6">
      <div className="space-y-3" data-testid="club-header">
        <div className="flex items-center gap-4">
          <ClubLogo club={{ id: club.id, name: club.name, logoUpdatedAt: club.profile.logoUpdatedAt }} size={72} />
          <div className="min-w-0">
            <h1 className="font-serif text-3xl text-primary">{club.name}</h1>
            <p className="text-ink-muted">
              Votre rôle : {isAdmin ? "admin" : "membre"}
              {isCaptain ? " · capitaine" : ""}
            </p>
            <p className="text-ink-muted" data-testid="club-followers">
              {followersLabel(followers)}
            </p>
          </div>
        </div>
        {!isProfileEmpty(club.profile) && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted" data-testid="club-summary">
            {club.profile.city && <li>{club.profile.city}</li>}
            {club.profile.licenseeCount !== null && <li>{formatCount(club.profile.licenseeCount)} licencié{club.profile.licenseeCount > 1 ? "s" : ""}</li>}
            {club.profile.websiteUrl && (
              <li>
                <a href={club.profile.websiteUrl} target="_blank" rel="noopener noreferrer" className="break-all text-primary underline">
                  {websiteLabel(club.profile.websiteUrl)}
                </a>
              </li>
            )}
          </ul>
        )}
        <div className="flex flex-wrap gap-3">
          {(isAdmin || !isProfileEmpty(club.profile)) && (
            <ButtonLink href={`/clubs/${club.id}/fiche`} variant="ghost">
              {isAdmin && isProfileEmpty(club.profile) ? "Compléter la fiche du club" : "Voir la fiche du club"}
            </ButtonLink>
          )}
          {publicSettings?.publicPage && publicSettings.slug && <CopyLinkButton path={publicPath(publicSettings.slug)} />}
          {isAdmin && (
            <ButtonLink href={`/clubs/${club.id}/joueurs`} variant="ghost">
              Joueurs du club
            </ButtonLink>
          )}
        </div>
      </div>

      <Suspense fallback={null}>
        <StoriesSection userId={user.id} clubId={club.id} clubName={club.name} />
      </Suspense>

      {pendingReports.length > 0 && (
        <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm" data-testid="story-reports">
          <h2 className="font-serif text-xl text-primary">Cartes signalées ({pendingReports.length})</h2>
          <ul className="divide-y divide-line">
            {pendingReports.map((r) => (
              <li key={r.storyId} className="space-y-2 py-3" data-testid="story-report">
                <p className="font-medium">
                  Carte de {r.authorName} : {r.matchLabel}
                </p>
                {r.comment && <p className="text-sm text-ink-muted">« {r.comment} »</p>}
                <ul className="text-sm text-ink-muted">
                  {r.reports.map((x, i) => (
                    <li key={i}>
                      {x.reason ? `Motif : ${x.reason}` : "Signalée sans motif"}
                    </li>
                  ))}
                </ul>
                <ReportReview storyId={r.storyId} authorName={r.authorName} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {returnRequests.length > 0 && (
        <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm" data-testid="return-requests">
          <h2 className="font-serif text-xl text-primary">Demandes pour revenir ({returnRequests.length})</h2>
          <ul className="divide-y divide-line">
            {returnRequests.map((r) => (
              <li key={r.userId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="flex items-center gap-3">
                  <Avatar user={{ id: r.userId, avatarKey: r.avatarKey, avatarPhotoAt: r.avatarPhotoAt }} size={36} />
                  <span className="font-medium">{r.displayName}</span>
                </span>
                <ReturnRequestForm clubId={club.id} userId={r.userId} displayName={r.displayName} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-serif text-xl text-primary">Rencontres</h2>
          <Link href={`/resultats-clubs?club=${club.id}`} data-testid="club-results-link" className="inline-flex min-h-11 items-center font-semibold text-primary underline">
            Tous les résultats ›
          </Link>
        </div>
        {encounters.length > 0 && <EncounterFilters clubId={club.id} current={filter} counts={countFilters(encounters)} />}
        <EncounterList
          items={applyFilter(encounters, filter)}
          empty={
            filter !== "toutes"
              ? "Aucune rencontre dans cette catégorie."
              : isAdmin || isCaptain
                ? "Aucune rencontre pour l'instant."
                : "Ton capitaine publiera bientôt la prochaine rencontre."
          }
        />
        {(isAdmin || isCaptain) && (
          <ButtonLink href={`/clubs/${club.id}/rencontres/nouvelle`}>Nouvelle rencontre</ButtonLink>
        )}
        {(isAdmin || isCaptain) && archived.length > 0 && (
          <details className="border-t border-line pt-2" data-testid="archives">
            <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-primary">Archives ({archived.length})</summary>
            <EncounterList items={archived} empty="Aucune rencontre archivée." archives />
          </details>
        )}
      </div>

      {(tournaments.length > 0 || isAdmin) && (
        <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm" data-testid="club-tournaments">
          <h2 className="font-serif text-xl text-primary">Tournois</h2>
          <TournamentList items={tournaments} empty="Aucun tournoi pour l'instant." />
          {isAdmin && <ButtonLink href={`/clubs/${club.id}/tournois/nouveau`}>Nouveau tournoi</ButtonLink>}
        </div>
      )}

      <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm" data-testid="club-top3">
        <h2 className="font-serif text-xl text-primary">Classement</h2>
        {board.top.length === 0 ? (
          <p className="text-ink-muted">Personne n&apos;est encore classé sur la saison.</p>
        ) : (
          <LeaderboardTable rows={board.top} viewerId={user.id} compact />
        )}
        {board.myRow && (
          <p className="text-sm text-ink-muted" data-testid="my-place">
            Ta place : <strong className="text-ink">{rankLabel(board.myRow.rank)}</strong>
            {board.myMove && <RankMoveBadge move={board.myMove} />}
            {board.myMove && board.myMove.kind !== "new" && <span> depuis lundi</span>}
          </p>
        )}
        <ButtonLink href={`/clubs/${club.id}/classement`} variant="ghost">
          Voir le classement
        </ButtonLink>
      </div>

      <details className="rounded-2xl bg-surface p-4 shadow-sm" data-testid="section-standings">
        <summary className={SECTION_SUMMARY}>Classement des équipes</summary>
        <div className="pt-2">
          <TeamStandingsTable data={standings} seasonHref={(y) => `/clubs/${club.id}?saison=${y}`} />
        </div>
      </details>

      <details className="rounded-2xl bg-surface p-4 shadow-sm" data-testid="section-teams">
        <summary className={SECTION_SUMMARY}>Équipes du club ({clubTeams.length})</summary>
        <div className="space-y-3 pt-2">
          {clubTeams.length === 0 ? (
            <p className="text-ink-muted">Aucune équipe pour l&apos;instant.</p>
          ) : (
            <ul className="divide-y divide-line">
              {clubTeams.map((t) => (
                <li key={t.id}>
                  <Link href={`/equipes/${t.id}`} className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-2">
                    <span className="font-medium text-primary">{t.name}</span>
                    <span className="text-sm text-ink-muted">
                      {t.captain ? `Cap. ${t.captain.displayName}` : "Sans capitaine"} · {t.playerCount} joueur{t.playerCount > 1 ? "s" : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {isAdmin && (
            <details>
              <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-primary">Créer une équipe</summary>
              <div className="pt-2">
                <CreateTeamForm clubId={club.id} members={club.members.map((m) => ({ userId: m.userId, displayName: m.displayName }))} />
              </div>
            </details>
          )}
        </div>
      </details>

      <details className="rounded-2xl bg-surface p-4 shadow-sm" data-testid="section-opponents">
        <summary className={SECTION_SUMMARY}>Équipes adverses ({externalTeams.length})</summary>
        <div className="space-y-3 pt-2">
          <p className="text-sm text-ink-muted">Adversaires qui n&apos;utilisent pas Ralli, saisis par le club.</p>
          {externalTeams.length === 0 ? (
            <p className="text-ink-muted">Aucune équipe adverse pour l&apos;instant.</p>
          ) : (
            <ul className="divide-y divide-line">
              {externalTeams.map((t) => (
                <li key={t.id}>
                  <Link href={`/equipes/${t.id}`} className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-2">
                    <span className="font-medium text-primary">{t.name}</span>
                    <span className="text-sm text-ink-muted">
                      {t.externalClubName} · {t.playerCount} joueur{t.playerCount > 1 ? "s" : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {(isAdmin || isCaptain) && (
            <details>
              <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-primary">Ajouter une équipe adverse</summary>
              <div className="pt-2">
                <CreateExternalTeamForm clubId={club.id} />
              </div>
            </details>
          )}
        </div>
      </details>

      <details className="rounded-2xl bg-surface p-4 shadow-sm" data-testid="section-members">
        <summary className={SECTION_SUMMARY}>Membres ({club.members.length})</summary>
        <ul className="divide-y divide-line pt-2">
          {club.members.map((m) => (
            <li key={m.userId} className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-2">
              <span className="flex items-center gap-3">
                <Avatar user={{ id: m.userId, avatarKey: m.avatarKey, avatarPhotoAt: m.avatarPhotoAt }} size={36} />
                <Link href={m.userId === user.id ? "/profil" : `/membres/${m.userId}`} className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-2 hover:underline" data-testid="member-profile-link">
                  {m.displayName}
                </Link>
                {m.role === "ADMIN" && (
                  <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-on-primary">admin</span>
                )}
                {m.userId === user.id && <span className="ml-2 text-sm text-ink-muted">(vous)</span>}
              </span>
              {isAdmin && (
                <span className="flex flex-wrap items-center gap-2">
                  {m.avatarPhotoAt && m.userId !== user.id && <ResetAvatarForm clubId={club.id} userId={m.userId} displayName={m.displayName} />}
                  <MemberRoleForm clubId={club.id} userId={m.userId} displayName={m.displayName} role={m.role} isSelf={m.userId === user.id} />
                  {m.role === "MEMBER" && <RemoveMemberForm clubId={club.id} userId={m.userId} displayName={m.displayName} />}
                </span>
              )}
            </li>
          ))}
        </ul>
      </details>

      <div className="space-y-2 rounded-2xl bg-surface p-4 shadow-sm" data-testid="invite-club">
        <h2 className="font-serif text-xl text-primary">Inviter</h2>
        <WhatsAppShare
          label="Inviter par WhatsApp"
          text={`Rejoins ${club.name} sur Ralli pour pronostiquer nos interclubs de tennis (jeu gratuit, sans argent réel) :`}
          path={clubPath(club.id)}
        />
      </div>

      <div className="space-y-2 rounded-2xl bg-surface p-4 shadow-sm" data-testid="leave-club">
        <LeaveClubForm clubId={club.id} clubName={club.name} />
      </div>
    </section>
  );
}
