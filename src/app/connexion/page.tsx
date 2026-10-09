import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInForm } from "@/components/auth-forms";
import { parseInviteParam } from "@/lib/clubs/invite-link";

export const metadata: Metadata = { title: "Connexion · Ralli" };

export default function SignInPage({ searchParams }: { searchParams: Promise<{ invitation?: string | string[] }> }) {
  return (
    <section className="space-y-6">
      <h1 className="font-serif text-3xl text-primary">Se connecter</h1>
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
  return <SignInForm invitation={invitation} />;
}
