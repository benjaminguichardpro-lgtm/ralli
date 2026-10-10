import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ClubLogo } from "@/components/club-logo";
import { ButtonLink } from "@/components/ui";
import { requireUser } from "@/lib/auth/current-user";
import { listMyClubs } from "@/server/clubs";

export const metadata: Metadata = { title: "Mes clubs · Ralli" };

export default function ClubsPage() {
  return (
    <Suspense fallback={<p className="text-ink-muted">Chargement…</p>}>
      <Clubs />
    </Suspense>
  );
}

async function Clubs() {
  const user = await requireUser();
  const clubs = await listMyClubs(user.id);
  return (
    <section className="space-y-6">
      <h1 className="font-serif text-3xl text-primary">Mes clubs</h1>
      <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
        {clubs.length === 0 ? (
          <p className="text-ink-muted">Vous n&apos;êtes membre d&apos;aucun club pour l&apos;instant.</p>
        ) : (
          <ul className="divide-y divide-line" data-testid="my-clubs">
            {clubs.map((c) => (
              <li key={c.id}>
                <Link href={`/clubs/${c.id}`} className="flex min-h-11 items-center justify-between gap-3 py-2 font-medium text-primary">
                  <span className="flex items-center gap-3">
                    <ClubLogo club={c} size={40} />
                    {c.name}
                  </span>
                  <span className="text-sm text-ink-muted">{c.role === "ADMIN" ? "admin" : "membre"}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-3 pt-2">
          <ButtonLink href="/clubs/rejoindre">Rejoindre un club</ButtonLink>
          <ButtonLink href="/clubs/nouveau" variant="ghost">
            Créer un club
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
