import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { JoinInviteForm } from "@/components/club-forms";
import { ButtonLink } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/current-user";
import { parseInviteParam } from "@/lib/clubs/invite-link";
import { findClubByInviteCode } from "@/server/clubs";
import { getClubRole } from "@/server/permissions";

// Le lien contient un code d'invitation : ni indexé, ni suivi.
export const metadata: Metadata = { title: "Invitation · Ralli", robots: { index: false, follow: false } };

export default function InvitationPage({ params }: { params: Promise<{ code: string }> }) {
  return (
    <section className="space-y-6">
      <Suspense fallback={<p className="text-ink-muted">Chargement…</p>}>
        <Invitation params={params} />
      </Suspense>
    </section>
  );
}

async function Invitation({ params }: { params: Promise<{ code: string }> }) {
  const code = parseInviteParam((await params).code);
  const club = code ? await findClubByInviteCode(code) : null;
  if (!code || !club) {
    return (
      <div className="space-y-4 rounded-2xl bg-surface p-5 shadow-sm" data-testid="invitation-invalide">
        <h1 className="font-serif text-2xl text-primary">Lien d&apos;invitation invalide</h1>
        <p className="text-ink-muted">Ce lien n&apos;est plus valable : l&apos;admin du club a peut-être généré un nouveau code. Demande-lui un nouveau lien.</p>
        <ButtonLink href="/" variant="ghost">
          Retour à l&apos;accueil
        </ButtonLink>
      </div>
    );
  }

  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="space-y-4 rounded-2xl bg-surface p-5 shadow-sm">
        <p className="text-sm font-bold uppercase tracking-widest text-ink-muted">Invitation</p>
        <h1 className="font-serif text-3xl text-primary" data-testid="invitation-club">
          {club.name}
        </h1>
        <p className="text-ink-muted">Tu es invité à rejoindre ce club sur Ralli pour pronostiquer ses rencontres d&apos;interclubs, avec des Aces qui n&apos;ont aucune valeur.</p>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href={`/inscription?invitation=${code}`}>Créer un compte</ButtonLink>
          <ButtonLink href={`/connexion?invitation=${code}`} variant="ghost">
            J&apos;ai déjà un compte
          </ButtonLink>
        </div>
      </div>
    );
  }

  if (await getClubRole(user.id, club.id)) {
    return (
      <div className="space-y-4 rounded-2xl bg-surface p-5 shadow-sm">
        <h1 className="font-serif text-2xl text-primary">Tu es déjà membre de {club.name}</h1>
        <ButtonLink href={`/clubs/${club.id}`}>Ouvrir le club</ButtonLink>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl bg-surface p-5 shadow-sm">
      <p className="text-sm font-bold uppercase tracking-widest text-ink-muted">Invitation</p>
      <h1 className="font-serif text-3xl text-primary" data-testid="invitation-club">
        Rejoindre {club.name} ?
      </h1>
      <p className="text-ink-muted">Tu pourras pronostiquer les rencontres du club et apparaître dans son classement.</p>
      <JoinInviteForm code={code} clubName={club.name} />
      <Link href="/" className="inline-flex min-h-11 items-center font-semibold text-primary underline">
        Non merci
      </Link>
    </div>
  );
}
