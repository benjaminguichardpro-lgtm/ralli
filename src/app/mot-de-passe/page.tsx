import type { Metadata } from "next";
import { Suspense } from "react";
import { ChangePasswordForm } from "@/components/auth-forms";
import { requireUser } from "@/lib/auth/current-user";

export const metadata: Metadata = { title: "Mot de passe · Ralli" };

export default function ChangePasswordPage() {
  return (
    <section className="space-y-6">
      <h1 className="font-serif text-3xl text-primary">Changer de mot de passe</h1>
      <Suspense fallback={<p className="text-ink-muted">Chargement…</p>}>
        <Content />
      </Suspense>
    </section>
  );
}

async function Content() {
  const user = await requireUser({ allowPendingPasswordChange: true });
  return (
    <>
      {user.mustChangePassword && (
        <p className="rounded-lg border-l-4 border-accent bg-surface p-3">
          Vous vous êtes connecté avec un mot de passe temporaire. Choisissez-en un nouveau pour continuer.
        </p>
      )}
      <div className="rounded-xl bg-surface p-4 shadow-sm">
        <ChangePasswordForm />
      </div>
    </>
  );
}
