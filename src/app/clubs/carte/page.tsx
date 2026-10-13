import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ClubMapFilters } from "@/components/club-map-filters";
import { ClubMap } from "@/components/club-map";
import { requireUser } from "@/lib/auth/current-user";
import { toMapClubs } from "@/lib/clubs/map";
import { directoryHref, parseClubFilters } from "@/lib/clubs/search";
import { searchClubs } from "@/server/club-directory";

export const metadata: Metadata = { title: "Carte des clubs · Ralli" };

type SearchParams = { q?: string | string[]; region?: string | string[]; taille?: string | string[]; avenir?: string | string[] };

export default function ClubMapPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <section className="space-y-4">
      <h1 className="font-serif text-3xl text-primary">Carte des clubs</h1>
      <Suspense fallback={<p className="text-ink-muted">Chargement…</p>}>
        <MapView searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function MapView({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const params = await searchParams;
  const raw = params.q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.slice(0, 80) ?? "";
  const filters = parseClubFilters(params);
  const all = await searchClubs(user.id, q, 500, filters);
  const onMap = toMapClubs(all);
  const hidden = all.length - onMap.length;
  return (
    <>
      <Link href={directoryHref("/clubs/recherche", q, filters)} className="inline-flex min-h-11 items-center font-semibold text-primary underline" data-testid="map-back">
        ‹ Retour à la liste
      </Link>
      <div className="relative">
        <ClubMapFilters q={q} filters={filters} />
        <ClubMap clubs={onMap} className="h-[70dvh] min-h-96" />
      </div>
      <p className="text-sm text-ink-muted" data-testid="map-count">
        {onMap.length} club{onMap.length > 1 ? "s" : ""} sur la carte
        {hidden > 0 && ` · ${hidden} sans adresse localisée (visible${hidden > 1 ? "s" : ""} dans la liste)`}
      </p>
    </>
  );
}
