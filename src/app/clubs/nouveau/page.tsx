import type { Metadata } from "next";
import { Suspense } from "react";
import { CreateClubForm } from "@/components/club-forms";
import { requireUser } from "@/lib/auth/current-user";

export const metadata: Metadata = { title: "Créer un club · Ralli" };

export default function NewClubPage() {
  return (
    <section className="space-y-6">
      <h1 className="font-serif text-3xl text-primary">Créer un club</h1>
      <p className="text-ink-muted">Vous en serez l&apos;admin. Un code d&apos;invitation sera généré pour faire venir les membres.</p>
      <Suspense fallback={<p className="text-ink-muted">Chargement…</p>}>
        <Guarded />
      </Suspense>
    </section>
  );
}

async function Guarded() {
  await requireUser();
  return (
    <div className="rounded-xl bg-surface p-4 shadow-sm">
      <CreateClubForm />
    </div>
  );
}
