import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ButtonLink } from "@/components/ui";
import { requireUser } from "@/lib/auth/current-user";
import { listMyClubs } from "@/server/clubs";

export const metadata: Metadata = { title: "Classement · Ralli" };

export default function RankingChooserPage() {
  return (
    <Suspense fallback={<p className="text-ink-muted">Chargement…</p>}>
      <Chooser />
    </Suspense>
  );
}

/** Le classement est propre à chaque club : un seul club mène directement à son classement, sinon on choisit. */
async function Chooser() {
  const user = await requireUser();
  const clubs = await listMyClubs(user.id);
  if (clubs.length === 1) redirect(`/clubs/${clubs[0]!.id}/classement`);
  return (
    <section className="space-y-6">
      <h1 className="font-serif text-3xl text-primary">Classement</h1>
      <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
        {clubs.length === 0 ? (
          <>
            <p className="text-ink-muted">Rejoignez un club pour voir son classement.</p>
            <ButtonLink href="/clubs/rejoindre">Rejoindre un club</ButtonLink>
          </>
        ) : (
          <>
            <p className="text-ink-muted">Choisissez le club.</p>
            <ul className="divide-y divide-line">
              {clubs.map((c) => (
                <li key={c.id}>
                  <Link href={`/clubs/${c.id}/classement`} className="flex min-h-11 items-center py-2 font-medium text-primary">
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
