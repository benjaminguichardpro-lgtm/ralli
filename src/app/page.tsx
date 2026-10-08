import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { StatusBadge } from "@/components/encounter-list";
import { type Access, MatchPicks } from "@/components/match-picks";
import { ButtonLink } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/current-user";
import { formatParisDay, formatParisTime, relativeDayLabel } from "@/lib/time";
import { type FeedEncounter, getHomeFeed } from "@/server/feed";

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
  const now = new Date();
  const feed = await getHomeFeed(user.id, now);
  const next = feed.encounters.find((e) => e.status === "OPEN");

  return (
    <section className="space-y-5">
      <h1 className="text-[0.9375rem] font-normal text-ink-muted">
        Bonjour <strong className="font-semibold text-ink">{user.displayName}</strong>
      </h1>

      {!feed.hasClub ? (
        <div className="space-y-3 rounded-2xl bg-surface p-5 shadow-sm">
          <h2 className="font-serif text-xl text-primary">Rejoignez votre club</h2>
          <p className="text-ink-muted">Avec le code d&apos;invitation de votre club, vous pronostiquez ses rencontres d&apos;interclubs.</p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/clubs/rejoindre">Rejoindre un club</ButtonLink>
            <ButtonLink href="/clubs/nouveau" variant="ghost">
              Créer un club
            </ButtonLink>
          </div>
        </div>
      ) : feed.encounters.length === 0 ? (
        <div className="space-y-3 rounded-2xl bg-surface p-5 shadow-sm">
          <h2 className="font-serif text-xl text-primary">Pas de rencontre pour l&apos;instant</h2>
          <p className="text-ink-muted">Dès qu&apos;un capitaine ou un admin publie une rencontre de votre club, elle apparaît ici avec ses cotes.</p>
          <ButtonLink href="/clubs" variant="ghost">
            Mes clubs
          </ButtonLink>
        </div>
      ) : (
        <>
          {next && <NextEncounter e={next} now={now} />}
          <ul className="space-y-4" data-testid="feed">
            {feed.encounters.map((e) => (
              <li key={e.id}>
                <EncounterCard e={e} balance={feed.balance} now={now} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function NextEncounter({ e, now }: { e: FeedEncounter; now: Date }) {
  const rel = relativeDayLabel(e.startsAt, now);
  return (
    <Link
      href={`/rencontres/${e.id}`}
      data-testid="next-encounter"
      className="block space-y-1 rounded-2xl bg-primary-dark p-5 text-on-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-on-primary-soft">Prochaine rencontre</p>
      <p className="flex flex-wrap items-baseline gap-x-3">
        <span className="font-figures text-[2.75rem] font-bold leading-none" data-testid="next-time">
          {formatParisTime(e.startsAt)}
        </span>
        <span className="text-lg font-semibold">
          {formatParisDay(e.startsAt)}
          {rel && <span className="font-normal text-on-primary-soft"> · {rel}</span>}
        </span>
      </p>
      <p className="pt-1 text-on-primary-soft">
        <strong className="font-semibold text-on-primary">{e.home}</strong> contre {e.away}
      </p>
      <p className="pt-2">
        <span className="inline-block rounded-full bg-gold px-3 py-1 text-[0.8125rem] font-bold text-on-gold">
          Pronostics ouverts jusqu&apos;à {formatParisTime(e.predictionsCloseAt)}
        </span>
      </p>
    </Link>
  );
}

function EncounterCard({ e, balance, now }: { e: FeedEncounter; balance: number; now: Date }) {
  const share = { title: `${e.home} – ${e.away}`, whenLabel: `${formatParisDay(e.startsAt)} à ${formatParisTime(e.startsAt)}`, path: `/rencontres/${e.id}` };
  const access: Access =
    e.status !== "OPEN" ? { kind: "none" } : e.blockedReason ? { kind: "note", text: e.blockedReason, testId: "blocked" } : { kind: "predict", balance };
  const rel = relativeDayLabel(e.startsAt, now);
  return (
    <article className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
      <Link href={`/rencontres/${e.id}`} className="block space-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="font-semibold">
            {e.home} – {e.away}
          </span>
          <span className="font-data font-bold text-accent">
            {formatParisTime(e.startsAt)}
            <span className="font-sans text-sm font-medium"> · {rel ?? formatParisDay(e.startsAt)}</span>
          </span>
        </span>
        <span className="flex items-center gap-2 text-sm text-ink-muted">
          <StatusBadge status={e.status} label={e.statusLabel} />
          {e.matches.length} simple{e.matches.length > 1 ? "s" : ""}
        </span>
      </Link>
      <ol className="divide-y divide-line">
        {e.matches.map((m) => (
          <li key={m.id} className="space-y-1.5 py-3">
            <p className="text-xs text-ink-muted">Simple {m.number}</p>
            <MatchPicks matchId={m.id} home={m.home} away={m.away} access={access} mine={m.mine} share={share} />
          </li>
        ))}
      </ol>
    </article>
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
