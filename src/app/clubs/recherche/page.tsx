import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ClubCardList } from "@/components/club-card-list";
import { ClubSearchBar } from "@/components/club-directory";
import { requireUser } from "@/lib/auth/current-user";
import { searchClubs } from "@/server/club-directory";

export const metadata: Metadata = { title: "Rechercher un club · Ralli" };

export default function ClubSearchPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  return (
    <section className="space-y-5">
      <h1 className="font-serif text-3xl text-primary">Rechercher un club</h1>
      <Suspense fallback={<p className="text-ink-muted">Chargement…</p>}>
        <Results searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function Results({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const user = await requireUser();
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.slice(0, 80) ?? "";
  const clubs = await searchClubs(user.id, q);
  return (
    <>
      <ClubSearchBar defaultValue={q} />
      <p className="text-sm text-ink-muted" data-testid="club-count">
        {q.trim() ? `${clubs.length} club${clubs.length > 1 ? "s" : ""} trouvé${clubs.length > 1 ? "s" : ""}` : "Tous les clubs de Ralli, les plus suivis d'abord"}
      </p>
      <ClubCardList clubs={clubs} empty="Aucun club ne correspond à cette recherche. Essaie un autre nom, une ville ou un code postal." />
      <div className="space-y-2 rounded-2xl bg-pale p-4">
        <p className="text-ink">Tu organises des tournois ?</p>
        <Link href="/clubs/demande" className="inline-flex min-h-11 items-center font-semibold text-primary underline">
          Inscrire mon club
        </Link>
      </div>
    </>
  );
}
