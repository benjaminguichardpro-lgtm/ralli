import type { Metadata } from "next";
import { Suspense } from "react";
import { SignUpForm } from "@/components/auth-forms";
import { parseInviteParam } from "@/lib/clubs/invite-link";

export const metadata: Metadata = { title: "Inscription · Ralli" };

export default function SignUpPage({ searchParams }: { searchParams: Promise<{ invitation?: string | string[] }> }) {
  return (
    <section className="space-y-6">
      <h1 className="font-serif text-3xl text-primary">Créer un compte</h1>
      <p className="text-ink-muted">Vous recevez 1000 Aces pour commencer. Les Aces n&apos;ont aucune valeur et ne s&apos;achètent pas.</p>
      <div className="rounded-2xl bg-surface p-4 shadow-sm">
        <Suspense fallback={null}>
          <Form searchParams={searchParams} />
        </Suspense>
      </div>
    </section>
  );
}

async function Form({ searchParams }: { searchParams: Promise<{ invitation?: string | string[] }> }) {
  const invitation = parseInviteParam((await searchParams).invitation) ?? undefined;
  return <SignUpForm invitation={invitation} />;
}
