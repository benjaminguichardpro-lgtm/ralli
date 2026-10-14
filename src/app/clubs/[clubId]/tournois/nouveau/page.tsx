import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CreateTournamentForm } from "@/components/tournament-forms";
import { requireUser } from "@/lib/auth/current-user";
import { getClubRole } from "@/server/permissions";

export const metadata: Metadata = { title: "Nouveau tournoi · Ralli" };

export default function NewTournamentPage({ params }: { params: Promise<{ clubId: string }> }) {
  return (
    <section className="space-y-6">
      <h1 className="font-serif text-3xl text-primary">Nouveau tournoi</h1>
      <Suspense fallback={<p className="text-ink-muted">Chargement…</p>}>
        <Content params={params} />
      </Suspense>
    </section>
  );
}

async function Content({ params }: { params: Promise<{ clubId: string }> }) {
  const user = await requireUser();
  const { clubId } = await params;
  if ((await getClubRole(user.id, clubId)) !== "ADMIN") notFound(); // réservé aux admins du club
  return (
    <div className="rounded-2xl bg-surface p-4 shadow-sm">
      <CreateTournamentForm clubId={clubId} />
    </div>
  );
}
