import Link from "next/link";
import { Suspense } from "react";
import { EncounterList } from "@/components/encounter-list";
import { ButtonLink } from "@/components/ui";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listMyClubs } from "@/server/clubs";
import { listUpcomingForUser } from "@/server/encounters";
import { getBalance } from "@/server/ledger";

export default function Home() {
  return (
    <Suspense fallback={<p className="text-ink-muted">Chargement…</p>}>
      <HomeContent />
    </Suspense>
  );
}

async function HomeContent() {
  const user = await getCurrentUser();
  if (!user) return <Welcome />;
  if (user.mustChangePassword) redirect("/mot-de-passe");
  const [clubs, balance, upcoming] = await Promise.all([listMyClubs(user.id), getBalance(user.id), listUpcomingForUser(user.id)]);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl text-primary">Bonjour {user.displayName}</h1>
        <p className="text-ink-muted">
          Solde : <strong data-testid="balance" className="text-ink">{balance.toLocaleString("fr-FR")} Aces</strong>
        </p>
      </div>

      <div className="space-y-3 rounded-xl bg-surface p-4 shadow-sm">
        <h2 className="font-serif text-xl text-primary">Rencontres à venir</h2>
        <EncounterList items={upcoming} empty="Aucune rencontre publiée dans vos clubs." />
      </div>

      <div className="space-y-3 rounded-xl bg-surface p-4 shadow-sm">
        <h2 className="font-serif text-xl text-primary">Mes clubs</h2>
        {clubs.length === 0 ? (
          <p className="text-ink-muted">Vous n&apos;êtes membre d&apos;aucun club pour l&apos;instant.</p>
        ) : (
          <ul className="divide-y divide-canvas">
            {clubs.map((c) => (
              <li key={c.id}>
                <Link href={`/clubs/${c.id}`} className="flex min-h-11 items-center justify-between py-2 font-medium text-primary">
                  <span>{c.name}</span>
                  <span className="text-sm text-ink-muted">{c.role === "ADMIN" ? "admin" : "membre"}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-3 pt-2">
          <ButtonLink href="/clubs/rejoindre">Rejoindre un club</ButtonLink>
          <ButtonLink href="/clubs/nouveau" variant="ghost">
            Créer un club
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}

function Welcome() {
  return (
    <section className="space-y-4">
      <h1 className="font-serif text-3xl text-primary">Bienvenue sur Ralli</h1>
      <p>Pronostiquez les rencontres d&apos;interclubs de votre club avec vos Aces, une monnaie fictive sans aucune valeur.</p>
      <div className="flex flex-wrap gap-3">
        <ButtonLink href="/inscription">Créer un compte</ButtonLink>
        <ButtonLink href="/connexion" variant="ghost">
          Se connecter
        </ButtonLink>
      </div>
    </section>
  );
}
