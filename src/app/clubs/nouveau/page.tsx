import type { Metadata } from "next";
import { Suspense } from "react";
import { CreateClubForm } from "@/components/club-forms";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { canCreateClub } from "@/server/club-requests";

export const metadata: Metadata = { title: "Créer un club · Ralli" };

export default function NewClubPage() {
  return (
    <section className="space-y-6">
      <h1 className="font-serif text-3xl text-primary">Créer un club</h1>
      <p className="text-ink-muted">Vous en serez l&apos;admin. Les membres te trouveront en cherchant le club, ou avec le lien que tu partages.</p>
      <Suspense fallback={<p className="text-ink-muted">Chargement…</p>}>
        <Guarded />
      </Suspense>
    </section>
  );
}

async function Guarded() {
  const user = await requireUser();
  if (!(await canCreateClub(user.id))) redirect("/clubs/demande");
  return (
    <div className="rounded-2xl bg-surface p-4 shadow-sm">
      <CreateClubForm />
    </div>
  );
}
