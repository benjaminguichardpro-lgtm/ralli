import type { Metadata } from "next";
import { Suspense } from "react";
import { ClubRequestForm } from "@/components/club-forms";
import { ButtonLink } from "@/components/ui";
import { requireUser } from "@/lib/auth/current-user";
import { getLatestClubRequest } from "@/server/club-requests";

export const metadata: Metadata = { title: "Admin de club · Ralli" };

export default function ClubRequestPage() {
  return (
    <section className="space-y-6">
      <h1 className="font-serif text-3xl text-primary">Je suis admin d&apos;un club</h1>
      <Suspense fallback={<p className="text-ink-muted">Chargement…</p>}>
        <Content />
      </Suspense>
    </section>
  );
}

async function Content() {
  const user = await requireUser();
  const last = await getLatestClubRequest(user.id);

  if (last?.status === "PENDING") {
    return (
      <div className="space-y-2 rounded-2xl bg-surface p-5 shadow-sm" data-testid="request-pending">
        <h2 className="font-serif text-xl text-primary">Demande en cours d&apos;examen</h2>
        <p className="text-ink-muted">
          L&apos;équipe Ralli vérifie ta demande pour le club {last.clubName}. Tu pourras ensuite créer ton club depuis cette page.
        </p>
      </div>
    );
  }

  if (last?.status === "APPROVED" && last.clubId === null) {
    return (
      <div className="space-y-3 rounded-2xl bg-surface p-5 shadow-sm" data-testid="request-approved">
        <h2 className="font-serif text-xl text-primary">Demande acceptée</h2>
        <p className="text-ink-muted">Tu peux créer ton club. Tu en seras l&apos;admin.</p>
        <ButtonLink href="/clubs/nouveau">Créer mon club</ButtonLink>
      </div>
    );
  }

  return (
    <>
      {last?.status === "REFUSED" ? (
        <div className="space-y-1 rounded-2xl bg-surface p-5 shadow-sm" data-testid="request-refused">
          <h2 className="font-serif text-xl text-primary">Demande refusée</h2>
          <p className="text-ink-muted">{last.refusalReason ?? "Ta précédente demande n'a pas été retenue."} Tu peux en faire une nouvelle.</p>
        </div>
      ) : (
        <p className="text-ink-muted">
          Créer un club est réservé aux admins de club. Remplis ce formulaire : l&apos;équipe Ralli vérifie ta demande avant d&apos;activer ton compte.
        </p>
      )}
      <div className="rounded-2xl bg-surface p-4 shadow-sm">
        <ClubRequestForm />
      </div>
    </>
  );
}
