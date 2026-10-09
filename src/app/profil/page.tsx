import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { signOutAction } from "@/app/actions/auth";
import { Avatar } from "@/components/avatar";
import { AvatarPicker, PhotoUploadButton } from "@/components/profile-forms";
import { requireUser } from "@/lib/auth/current-user";

export const metadata: Metadata = { title: "Mon profil · Ralli" };

export default function ProfilePage() {
  return (
    <section className="space-y-6">
      <h1 className="font-serif text-3xl text-primary">Mon profil</h1>
      <Suspense fallback={<p className="text-ink-muted">Chargement…</p>}>
        <Content />
      </Suspense>
    </section>
  );
}

async function Content() {
  const user = await requireUser();
  return (
    <>
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-surface p-5 shadow-sm">
        <Avatar user={user} size={112} />
        <p className="font-serif text-2xl text-primary" data-testid="profile-name">
          {user.displayName}
        </p>
        <PhotoUploadButton />
      </div>

      <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
        <h2 className="font-serif text-xl text-primary">Ou choisir un avatar</h2>
        <AvatarPicker current={user.avatarPhotoAt ? null : user.avatarKey} />
      </div>

      <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
        <Link href="/mot-de-passe" className="inline-flex min-h-11 items-center font-semibold text-primary underline">
          Changer de mot de passe
        </Link>
        <form action={signOutAction}>
          <button
            type="submit"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-primary bg-surface px-4 font-semibold text-primary"
          >
            Déconnexion
          </button>
        </form>
      </div>
    </>
  );
}
