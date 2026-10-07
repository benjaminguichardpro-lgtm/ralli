import type { Metadata } from "next";
import { SignInForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Connexion · Ralli" };

export default function SignInPage() {
  return (
    <section className="space-y-6">
      <h1 className="font-serif text-3xl text-primary">Se connecter</h1>
      <div className="rounded-xl bg-surface p-4 shadow-sm">
        <SignInForm />
      </div>
    </section>
  );
}
