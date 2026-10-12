import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ClubLogo } from "@/components/club-logo";
import { StatusBadge } from "@/components/encounter-list";
import { BigLogo, LawnCard, lawnButton } from "@/components/lawn-card";
import { ClubSearchBar } from "@/components/club-directory";
import { StoriesSection } from "@/components/stories-section";
import { WhatsAppShare } from "@/components/share-link";
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
  const others = feed.encounters.filter((e) => e !== next);
  const only = feed.stewardClubs[0];

  return (
    <section className="space-y-5">
      <h1 className="text-[0.9375rem] font-normal text-ink-muted">
        Bonjour <strong className="font-semibold text-ink">{user.displayName}</strong>
      </h1>

      <ClubSearchBar />

      {feed.hasClub && (
        <Suspense fallback={null}>
          <StoriesSection userId={user.id} />
        </Suspense>
      )}

      {!feed.hasClub ? (
        <div className="space-y-3 rounded-2xl bg-surface p-5 shadow-sm">
          <h2 className="font-serif text-xl text-primary">Trouve ton club</h2>
          <p className="text-ink-muted">Cherche ton club, consulte ses rencontres, puis rejoins-le d&apos;un bouton pour pronostiquer.</p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/clubs/recherche">Rechercher un club</ButtonLink>
            <ButtonLink href="/clubs/demande" variant="ghost">
              Je suis admin d&apos;un club
            </ButtonLink>
          </div>
        </div>
      ) : feed.encounters.length === 0 ? (
        <div className="space-y-3 rounded-2xl bg-surface p-5 shadow-sm">
          <h2 className="font-serif text-xl text-primary">Pas de rencontre pour l&apos;instant</h2>
          {feed.stewardClubs.length > 0 ? (
            <>
              <p className="text-ink-muted">Publie la prochaine rencontre de ton club : elle apparaît ici avec ses cotes, et tes coéquipiers peuvent pronostiquer.</p>
              <ButtonLink href={feed.stewardClubs.length === 1 && only ? `/clubs/${only.id}/rencontres/nouvelle` : "/clubs"}>
                Créer une rencontre
              </ButtonLink>
            </>
          ) : (
            <>
              <p className="text-ink-muted" data-testid="empty-member">
                Ton capitaine publiera bientôt la prochaine rencontre. Elle apparaîtra ici avec ses cotes.
              </p>
              <div className="flex flex-wrap gap-3">
                <WhatsAppShare
                  label="Inviter des coéquipiers"
                  text="Rejoins-moi sur Ralli pour pronostiquer les interclubs de tennis (jeu gratuit, sans argent réel) :"
                  path="/inscription"
                />
                <ButtonLink href="/clubs" variant="ghost">
                  Mes clubs
                </ButtonLink>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4" data-testid="feed">
          {next && <NextEncounter e={next} now={now} showLogo={feed.multiClub} />}
          {others.length > 0 && (
            <ul className="space-y-4">
              {others.map((e) => (
                <li key={e.id}>
                  <EncounterCard e={e} now={now} showLogo={feed.multiClub} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function NextEncounter({ e, now, showLogo }: { e: FeedEncounter; now: Date; showLogo: boolean }) {
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
      <p className="flex items-center gap-2 pt-1 text-on-primary-soft">
        {showLogo && <ClubLogo club={e.club} size={32} />}
        <span>
          <strong className="font-semibold text-on-primary">{e.home}</strong> contre {e.away}
        </span>
      </p>
      <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-2">
        <span className="inline-block rounded-full bg-gold px-3 py-1 text-[0.8125rem] font-bold text-on-gold">
          Pronostics ouverts jusqu&apos;à {formatParisTime(e.predictionsCloseAt)}
        </span>
        <span className="font-semibold text-gold" aria-hidden="true">
          {e.blockedReason ? "Voir la rencontre ›" : "Pronostiquer ›"}
        </span>
      </p>
    </Link>
  );
}

/** Rencontre suivante : une carte à toucher. Les cotes et le pronostic sont sur la page de la rencontre. */
function EncounterCard({ e, now, showLogo }: { e: FeedEncounter; now: Date; showLogo: boolean }) {
  const rel = relativeDayLabel(e.startsAt, now);
  return (
    <Link
      href={`/rencontres/${e.id}`}
      className="block space-y-1 rounded-2xl bg-surface p-4 shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <span className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="flex items-center gap-2 font-semibold">
          {showLogo && <ClubLogo club={e.club} size={28} />}
          <span>
            {e.home} – {e.away}
          </span>
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
  );
}

function Welcome() {
  return (
    <LawnCard>
      <BigLogo />
      <h1 className="sr-only">Bienvenue sur Ralli</h1>
      <p className="font-serif text-3xl font-semibold leading-tight">Les tournois de ton club, les pronostics de tes amis.</p>
      <p className="text-on-primary">Jeu gratuit, Aces sans valeur réelle.</p>
      <div className="grid w-full max-w-sm gap-3">
        <Link href="/inscription" className={lawnButton.solid}>
          Créer mon compte
        </Link>
        <Link href="/connexion" className={lawnButton.outline}>
          Se connecter
        </Link>
      </div>
      <p className="w-full max-w-sm rounded-lg border border-dashed border-on-primary/60 bg-on-primary/10 px-4 py-3">
        Tu organises des tournois ?{" "}
        <Link href="/inscription" className="font-bold underline underline-offset-4">
          Inscrire mon club
        </Link>
      </p>
      <Link href="/comment-ca-marche" className="inline-flex min-h-11 items-center font-medium underline underline-offset-4">
        Comment ça marche
      </Link>
    </LawnCard>
  );
}
