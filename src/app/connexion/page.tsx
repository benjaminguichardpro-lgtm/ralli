import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SignInForm } from "@/components/auth-forms";
import { BigLogo, LawnCard } from "@/components/lawn-card";
import { parseInviteParam } from "@/lib/clubs/invite-link";

export const metadata: Metadata = { title: "Connexion · Ralli" };

export default function SignInPage({ searchParams }: { searchParams: Promise<{ invitation?: string | string[] }> }) {
  return (
    <LawnCard>
      <Link href="/" aria-label="Retour à l'accueil de Ralli">
        <BigLogo size="text-7xl" />
      </Link>
      <h1 className="font-serif text-3xl font-semibold">Se connecter</h1>
      <div className="w-full max-w-sm rounded-2xl bg-surface p-4 text-left text-ink shadow-sm">
        <Suspense fallback={null}>
          <Form searchParams={searchParams} />
        </Suspense>
      </div>
    </LawnCard>
  );
}

async function Form({ searchParams }: { searchParams: Promise<{ invitation?: string | string[] }> }) {
  const invitation = parseInviteParam((await searchParams).invitation) ?? undefined;
  return <SignInForm invitation={invitation} />;
}
