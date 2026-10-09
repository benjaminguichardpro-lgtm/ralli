import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { InviteCodeReveal, MemberRoleForm, RegenerateCodeForm } from "@/components/club-forms";
import { ResetAvatarForm } from "@/components/profile-forms";
import { LeaderboardTable } from "@/components/leaderboard";
import { EncounterList } from "@/components/encounter-list";
import { CreateExternalTeamForm, CreateTeamForm } from "@/components/team-forms";
import { ButtonLink } from "@/components/ui";
import { requireUser } from "@/lib/auth/current-user";
import { type ClubView, getClubView } from "@/server/clubs";
import { listClubEncounters } from "@/server/encounters";
import { DomainError } from "@/server/errors";
import { getLeaderboard } from "@/server/leaderboard";
import { isCaptainInClub } from "@/server/permissions";
import { listClubTeams } from "@/server/teams";

export const metadata: Metadata = { title: "Club · Ralli" };

export default function ClubPage({ params }: { params: Promise<{ clubId: string }> }) {
  return (
    <Suspense fallback={<p className="text-ink-muted">Chargement…</p>}>
      <Club params={params} />
    </Suspense>
  );
}

async function Club({ params }: { params: Promise<{ clubId: string }> }) {
  const user = await requireUser();
  const { clubId } = await params;
  let club: ClubView;
  try {
    club = await getClubView(user.id, clubId);
  } catch (e) {
    // Non-membre ou club inexistant : même réponse, pour ne rien révéler.
    if (e instanceof DomainError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const isAdmin = club.myRole === "ADMIN";
  const [teams, isCaptain, encounters, board] = await Promise.all([
    listClubTeams(user.id, club.id),
    isCaptainInClub(user.id, club.id),
    listClubEncounters(user.id, club.id),
    getLeaderboard(user.id, club.id, "season", { limit: 3 }),
  ]);
  const clubTeams = teams.filter((t) => t.kind === "CLUB");
  const externalTeams = teams.filter((t) => t.kind === "EXTERNAL");

  return (
    <section className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl text-primary">{club.name}</h1>
        <p className="text-ink-muted">
          Votre rôle : {isAdmin ? "admin" : "membre"}
          {isCaptain ? " · capitaine" : ""}
        </p>
      </div>

      {isAdmin && club.inviteCode && (
        <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
          <h2 className="font-serif text-xl text-primary">Code d&apos;invitation</h2>
          <InviteCodeReveal code={club.inviteCode} />
          <p className="text-sm text-ink-muted">À communiquer aux membres, joueurs et proches. Ils le saisissent dans « Rejoindre un club ».</p>
          <RegenerateCodeForm clubId={club.id} />
        </div>
      )}

      <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
        <h2 className="font-serif text-xl text-primary">Rencontres</h2>
        <EncounterList items={encounters} empty="Aucune rencontre pour l'instant." />
        {(isAdmin || isCaptain) && (
          <ButtonLink href={`/clubs/${club.id}/rencontres/nouvelle`}>Nouvelle rencontre</ButtonLink>
        )}
      </div>

      <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm" data-testid="club-top3">
        <h2 className="font-serif text-xl text-primary">Classement</h2>
        {board.top.length === 0 ? (
          <p className="text-ink-muted">Personne n&apos;est encore classé sur la saison.</p>
        ) : (
          <LeaderboardTable rows={board.top} viewerId={user.id} compact />
        )}
        <ButtonLink href={`/clubs/${club.id}/classement`} variant="ghost">
          Voir le classement
        </ButtonLink>
      </div>

      <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
        <h2 className="font-serif text-xl text-primary">Équipes du club</h2>
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

      <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
        <h2 className="font-serif text-xl text-primary">Équipes adverses</h2>
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

      <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
        <h2 className="font-serif text-xl text-primary">Membres ({club.members.length})</h2>
        <ul className="divide-y divide-line">
          {club.members.map((m) => (
            <li key={m.userId} className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-2">
              <span className="flex items-center gap-3">
                <Avatar user={{ id: m.userId, avatarKey: m.avatarKey, avatarPhotoAt: m.avatarPhotoAt }} size={36} />
                <span className="font-medium">{m.displayName}</span>
                {m.role === "ADMIN" && (
                  <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-on-primary">admin</span>
                )}
                {m.userId === user.id && <span className="ml-2 text-sm text-ink-muted">(vous)</span>}
              </span>
              {isAdmin && (
                <span className="flex flex-wrap items-center gap-2">
                  {m.avatarPhotoAt && m.userId !== user.id && <ResetAvatarForm clubId={club.id} userId={m.userId} displayName={m.displayName} />}
                  <MemberRoleForm clubId={club.id} userId={m.userId} displayName={m.displayName} role={m.role} isSelf={m.userId === user.id} />
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
