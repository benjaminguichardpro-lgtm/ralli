import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SignUpForm } from "@/components/auth-forms";
import { BigLogo, LawnCard } from "@/components/lawn-card";
import { parseInviteParam } from "@/lib/clubs/invite-link";

export const metadata: Metadata = { title: "Inscription · Ralli" };

export default function SignUpPage({ searchParams }: { searchParams: Promise<{ invitation?: string | string[] }> }) {
  return (
    <LawnCard>
      <Link href="/" aria-label="Retour à l'accueil de Ralli">
        <BigLogo size="text-7xl" />
      </Link>
      <h1 className="font-serif text-3xl font-semibold">Créer un compte</h1>
      <p>Vous recevez 1000 Aces pour commencer. Les Aces n&apos;ont aucune valeur et ne s&apos;achètent pas.</p>
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
  return <SignUpForm invitation={invitation} />;
}
