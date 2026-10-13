import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ClubLogo } from "@/components/club-logo";
import { ClubLogoUploadButton, ClubProfileForm, DeleteClubSection, EditProfilePanel, PublicPageForm, RemoveClubLogoForm } from "@/components/club-profile-forms";
import { requireUser } from "@/lib/auth/current-user";
import { NOT_SPECIFIED, formatAddress, formatCount, isProfileEmpty, websiteLabel } from "@/lib/clubs/profile";
import { type ClubProfile, getClubProfile } from "@/server/club-profile";
import { getPublicPageSettings } from "@/server/club-public";
import { DomainError } from "@/server/errors";

export const metadata: Metadata = { title: "Fiche du club · Ralli" };

export default function ClubProfilePage({ params }: { params: Promise<{ clubId: string }> }) {
  return (
    <Suspense fallback={<p className="text-ink-muted">Chargement…</p>}>
      <ClubProfileView params={params} />
    </Suspense>
  );
}

function Row({ label, children, testId }: { label: string; children: React.ReactNode; testId: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3" data-testid={testId}>
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

const unspecified = <span className="font-normal text-ink-muted">{NOT_SPECIFIED}</span>;

async function ClubProfileView({ params }: { params: Promise<{ clubId: string }> }) {
  const user = await requireUser();
  const { clubId } = await params;
  let club: ClubProfile;
  try {
    club = await getClubProfile(user.id, clubId);
  } catch (e) {
    // Non-membre ou club inexistant : même réponse, pour ne rien révéler.
    if (e instanceof DomainError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const isAdmin = club.myRole === "ADMIN";
  const publicSettings = isAdmin ? await getPublicPageSettings(user.id, club.id) : null;
  const address = formatAddress(club);
  const num = (n: number | null) => (n === null ? unspecified : formatCount(n));

  return (
    <section className="space-y-6">
      <Link href={`/clubs/${club.id}`} className="inline-flex min-h-11 items-center font-semibold text-primary">
        ‹ Retour au club
      </Link>

      <div className="flex items-center gap-4">
        <ClubLogo club={club} size={88} />
        <div>
          <h1 className="font-serif text-3xl text-primary">{club.name}</h1>
          <p className="text-ink-muted">Fiche du club</p>
        </div>
      </div>

      {isAdmin && isProfileEmpty(club) && (
        <p className="rounded-2xl border border-accent bg-pale p-4" data-testid="profile-empty-admin">
          Complète la fiche de ton club avec le bouton « Modifier la fiche » : logo, adresse, site web… Tes membres la verront ici.
        </p>
      )}

      <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
        <h2 className="font-serif text-xl text-primary">Informations</h2>
        <dl className="divide-y divide-line">
          <Row label="Année de fondation" testId="profile-founded">
            {club.foundedYear ?? unspecified}
          </Row>
          <Row label="Nombre de licenciés" testId="profile-licensees">
            {num(club.licenseeCount)}
          </Row>
          <Row label="Adresse" testId="profile-address">
            {address ?? unspecified}
          </Row>
          <Row label="Site web" testId="profile-website">
            {club.websiteUrl ? (
              <a href={club.websiteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center break-all text-primary underline">
                {websiteLabel(club.websiteUrl)}
              </a>
            ) : (
              unspecified
            )}
          </Row>
          <Row label="Courts intérieurs" testId="profile-indoor">
            {num(club.indoorCourts)}
          </Row>
          <Row label="Courts extérieurs" testId="profile-outdoor">
            {num(club.outdoorCourts)}
          </Row>
        </dl>
        <p className="text-sm text-ink-muted">Informations indiquées par les admins du club.</p>
      </div>

      <div className="space-y-2 rounded-2xl bg-surface p-4 shadow-sm">
        <h2 className="font-serif text-xl text-primary">Présentation</h2>
        {club.description ? <p className="whitespace-pre-line" data-testid="profile-description">{club.description}</p> : <p className="text-ink-muted" data-testid="profile-description">{NOT_SPECIFIED}</p>}
      </div>

      {publicSettings && <PublicPageForm clubId={club.id} publicPage={publicSettings.publicPage} slug={publicSettings.slug} />}

      {isAdmin && (
        <EditProfilePanel>
          <div className="space-y-3">
            <ClubLogoUploadButton clubId={club.id} hasLogo={club.logoUpdatedAt !== null} />
            {club.logoUpdatedAt && <RemoveClubLogoForm clubId={club.id} />}
          </div>
          <ClubProfileForm
            clubId={club.id}
            initial={{
              name: club.name,
              foundedYear: club.foundedYear?.toString() ?? "",
              licenseeCount: club.licenseeCount?.toString() ?? "",
              address: club.address ?? "",
              postalCode: club.postalCode ?? "",
              city: club.city ?? "",
              websiteUrl: club.websiteUrl ?? "",
              description: club.description ?? "",
              indoorCourts: club.indoorCourts?.toString() ?? "",
              outdoorCourts: club.outdoorCourts?.toString() ?? "",
            }}
          />
        </EditProfilePanel>
      )}

      {isAdmin && <DeleteClubSection clubId={club.id} clubName={club.name} />}
    </section>
  );
}
