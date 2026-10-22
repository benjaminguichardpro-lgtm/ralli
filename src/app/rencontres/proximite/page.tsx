import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { NearbySection } from "@/components/nearby-section";
import { requireUser } from "@/lib/auth/current-user";

export const metadata: Metadata = { title: "Interclub à proximité · Ralli" };

export default function NearbyPage() {
  return (
    <section className="space-y-4">
      <h1 className="font-serif text-3xl text-primary">Interclub à proximité</h1>
      <Suspense fallback={<p className="text-ink-muted">Chargement…</p>}>
        <Content />
      </Suspense>
    </section>
  );
}

async function Content() {
  const user = await requireUser();
  return (
    <>
      <Link href="/clubs/recherche" className="inline-flex min-h-11 items-center font-semibold text-primary underline" data-testid="nearby-back">
        ‹ Rechercher un club
      </Link>
      <NearbySection userId={user.id} />
    </>
  );
}
