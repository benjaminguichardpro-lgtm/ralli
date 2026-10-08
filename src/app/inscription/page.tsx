import type { Metadata } from "next";
import { SignUpForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Inscription · Ralli" };

export default function SignUpPage() {
  return (
    <section className="space-y-6">
      <h1 className="font-serif text-3xl text-primary">Créer un compte</h1>
      <p className="text-ink-muted">Vous recevez 1000 Aces pour commencer. Les Aces n&apos;ont aucune valeur et ne s&apos;achètent pas.</p>
      <div className="rounded-2xl bg-surface p-4 shadow-sm">
        <SignUpForm />
      </div>
    </section>
  );
}
