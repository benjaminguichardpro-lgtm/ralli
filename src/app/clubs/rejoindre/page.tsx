import type { Metadata } from "next";
import { Suspense } from "react";
import { JoinClubForm } from "@/components/club-forms";
import { requireUser } from "@/lib/auth/current-user";

export const metadata: Metadata = { title: "Rejoindre un club · Ralli" };

export default function JoinClubPage({ searchParams }: { searchParams: Promise<{ code?: string | string[] }> }) {
  return (
    <section className="space-y-6">
      <h1 className="font-serif text-3xl text-primary">Rejoindre un club</h1>
      <Suspense fallback={<p className="text-ink-muted">Chargement…</p>}>
        <Guarded searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function Guarded({ searchParams }: { searchParams: Promise<{ code?: string | string[] }> }) {
  await requireUser();
  const { code } = await searchParams;
  const defaultCode = typeof code === "string" ? code.slice(0, 6).toUpperCase() : undefined;
  return (
    <div className="rounded-2xl bg-surface p-4 shadow-sm">
      <JoinClubForm defaultCode={defaultCode} />
    </div>
  );
}
