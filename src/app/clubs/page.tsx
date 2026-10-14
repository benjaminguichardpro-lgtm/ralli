import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ClubLogo } from "@/components/club-logo";
import { ButtonLink } from "@/components/ui";
import { requireUser } from "@/lib/auth/current-user";
import { type MyClub, listMyClubs } from "@/server/clubs";

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
  const admin = clubs.filter((c) => c.role === "ADMIN");
  const member = clubs.filter((c) => c.role !== "ADMIN");
  return (
    <section className="space-y-6">
      <h1 className="font-serif text-3xl text-primary">Mes clubs</h1>
      {clubs.length === 0 ? (
        <div className="rounded-2xl bg-surface p-4 shadow-sm">
          <p className="text-ink-muted">Tu n&apos;es membre d&apos;aucun club pour l&apos;instant. Cherche le tien et rejoins-le d&apos;un bouton.</p>
        </div>
      ) : (
        <div className="space-y-6" data-testid="my-clubs">
          {/* Les clubs administrés d'abord, séparés de ceux dont on est simple membre. */}
          {admin.length > 0 && <ClubGroup title="Mes clubs en tant qu'admin" clubs={admin} testId="my-admin-clubs" />}
          {member.length > 0 && <ClubGroup title={admin.length > 0 ? "Clubs dont je suis membre" : "Mes clubs"} clubs={member} testId="my-member-clubs" />}
        </div>
      )}
      <div className="rounded-2xl bg-surface p-4 shadow-sm">
        <div className="flex flex-wrap gap-3 pt-2">
          <ButtonLink href="/clubs/recherche">Rechercher un club</ButtonLink>
          <ButtonLink href="/clubs/demande" variant="ghost">
            Je suis admin d&apos;un club
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}

function ClubGroup({ title, clubs, testId }: { title: string; clubs: MyClub[]; testId: string }) {
  return (
    <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm" data-testid={testId}>
      <h2 className="font-serif text-xl text-primary">{title}</h2>
      <ul className="divide-y divide-line">
        {clubs.map((c) => (
          <li key={c.id}>
            <Link href={`/clubs/${c.id}`} className="flex min-h-11 items-center justify-between gap-3 py-2 font-medium text-primary">
              <span className="flex items-center gap-3">
                <ClubLogo club={c} size={40} />
                {c.name}
              </span>
              <span className="text-sm text-ink-muted">{c.role === "ADMIN" ? "Admin de ce club" : "membre"}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
