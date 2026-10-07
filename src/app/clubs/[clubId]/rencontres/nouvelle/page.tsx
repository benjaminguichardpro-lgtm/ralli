import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CreateEncounterForm } from "@/components/encounter-forms";
import { requireUser } from "@/lib/auth/current-user";
import { getNewEncounterOptions } from "@/server/encounters";
import { DomainError } from "@/server/errors";

export const metadata: Metadata = { title: "Nouvelle rencontre · Ralli" };

export default function NewEncounterPage({ params }: { params: Promise<{ clubId: string }> }) {
  return (
    <section className="space-y-6">
      <h1 className="font-serif text-3xl text-primary">Nouvelle rencontre</h1>
      <Suspense fallback={<p className="text-ink-muted">Chargement…</p>}>
        <Content params={params} />
      </Suspense>
    </section>
  );
}

async function Content({ params }: { params: Promise<{ clubId: string }> }) {
  const user = await requireUser();
  const { clubId } = await params;
  let options: Awaited<ReturnType<typeof getNewEncounterOptions>>;
  try {
    options = await getNewEncounterOptions(user.id, clubId);
  } catch (e) {
    if (e instanceof DomainError && e.code === "NOT_FOUND") notFound();
    if (e instanceof DomainError) return <p className="rounded-lg border-l-4 border-accent bg-surface p-3">{e.message}</p>;
    throw e;
  }
  if (options.opponents.length === 0) {
    return (
      <div className="space-y-3 rounded-xl bg-surface p-4 shadow-sm">
        <p>Le club n&apos;a encore aucune équipe adverse. Ajoutez d&apos;abord l&apos;adversaire dans « Équipes adverses ».</p>
        <Link href={`/clubs/${clubId}`} className="inline-flex min-h-11 items-center font-semibold text-primary underline">
          Retour au club
        </Link>
      </div>
    );
  }
  return (
    <div className="rounded-xl bg-surface p-4 shadow-sm">
      <CreateEncounterForm clubTeams={options.clubTeams} opponents={options.opponents} />
    </div>
  );
}
