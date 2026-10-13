import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ClubCardList } from "@/components/club-card-list";
import { ClubSearchBar } from "@/components/club-directory";
import { ClubMap } from "@/components/club-map";
import { toMapClubs } from "@/lib/clubs/map";
import { directoryHref, parseClubFilters } from "@/lib/clubs/search";
import { requireUser } from "@/lib/auth/current-user";
import { searchClubs } from "@/server/club-directory";

type SearchParams = { q?: string | string[]; region?: string | string[]; taille?: string | string[]; avenir?: string | string[] };

export const metadata: Metadata = { title: "Rechercher un club · Ralli" };

export default function ClubSearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <section className="space-y-5">
      <h1 className="font-serif text-3xl text-primary">Rechercher un club</h1>
      <Suspense fallback={<p className="text-ink-muted">Chargement…</p>}>
        <Results searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function Results({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.slice(0, 80) ?? "";
  const params = await searchParams;
  const filters = parseClubFilters(params);
  const filtered = Boolean(q.trim() || filters.region || filters.size || filters.upcomingOnly);
  const clubs = await searchClubs(user.id, q, 50, filters);
  const onMap = toMapClubs(await searchClubs(user.id, q, 500, filters));
  return (
    <>
      <ClubSearchBar defaultValue={q} />
      <Link href={directoryHref("/clubs/carte", q, filters)} className="relative block overflow-hidden rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" data-testid="map-preview-link" aria-label="Agrandir la carte des clubs">
        <ClubMap clubs={onMap} interactive={false} className="pointer-events-none h-44" />
        <span className="absolute inset-x-3 bottom-3 z-[500] flex min-h-11 items-center justify-center rounded-lg bg-primary-dark px-3 text-center font-semibold text-gold">
          Agrandir la carte · {onMap.length} club{onMap.length > 1 ? "s" : ""} localisé{onMap.length > 1 ? "s" : ""}
        </span>
      </Link>
      <p className="text-sm text-ink-muted" data-testid="club-count">
        {filtered ? `${clubs.length} club${clubs.length > 1 ? "s" : ""} trouvé${clubs.length > 1 ? "s" : ""}` : "Tous les clubs de Ralli, les plus suivis d'abord"}
      </p>
      <ClubCardList clubs={clubs} empty="Aucun club ne correspond à cette recherche. Essaie un autre nom, une ville, un code postal, ou efface les filtres." />
      <div className="space-y-2 rounded-2xl bg-pale p-4">
        <p className="text-ink">Tu organises des tournois ?</p>
        <Link href="/clubs/demande" className="inline-flex min-h-11 items-center font-semibold text-primary underline">
          Inscrire mon club
        </Link>
      </div>
    </>
  );
}
