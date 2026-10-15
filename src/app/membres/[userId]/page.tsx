import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Avatar } from "@/components/avatar";
import { signedAces } from "@/components/leaderboard";
import { requireUser } from "@/lib/auth/current-user";
import { streakLabel } from "@/lib/predictions/results";
import { PROFILE_RECENT, getMemberProfile } from "@/server/member-profile";

export const metadata: Metadata = { title: "Profil · Ralli", robots: { index: false } };

type Props = { params: Promise<{ userId: string }>; searchParams: Promise<{ limite?: string | string[] }> };

export default function MemberPage(props: Props) {
  return (
    <section className="space-y-4">
      <Suspense fallback={<p className="text-ink-muted">Chargement…</p>}>
        <Content {...props} />
      </Suspense>
    </section>
  );
}

const STATUS = { WON: "Gagné", LOST: "Perdu", REFUNDED: "Remboursé" } as const;
const card = "space-y-3 rounded-2xl bg-surface p-4 shadow-sm";

/** `?limite=` : par paliers de 10, de 10 à 100. */
function parseLimit(raw: string | string[] | undefined): number {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const n = v && /^\d{1,3}$/.test(v) ? Number(v) : PROFILE_RECENT;
  return Math.min(100, Math.max(PROFILE_RECENT, Math.ceil(n / PROFILE_RECENT) * PROFILE_RECENT));
}

async function Content({ params, searchParams }: Props) {
  const viewer = await requireUser();
  const { userId } = await params;
  // Son propre profil : la page « Mon profil » existante.
  if (userId === viewer.id) redirect("/profil");
  const limit = parseLimit((await searchParams).limite);
  const p = await getMemberProfile(viewer.id, userId, limit);
  if (!p) notFound();
  const since = p.user.createdAt.toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "Europe/Paris" });
  const streak = streakLabel(p.stats.streak);

  return (
    <div className="space-y-4" data-testid="member-profile">
      <Link href="/classement" className="inline-flex min-h-11 items-center font-semibold text-primary">
        ‹ Retour
      </Link>
      <div className="flex flex-col items-center gap-2 rounded-2xl bg-surface p-5 shadow-sm">
        <Avatar user={p.user} size={96} />
        <h1 className="font-serif text-3xl text-primary" data-testid="member-name">
          {p.user.displayName}
        </h1>
        <p className="text-sm text-ink-muted">Membre depuis {since}</p>
        <p className="text-center text-sm text-ink-muted" data-testid="member-clubs">
          {p.commonClubs.length > 1 ? "Clubs en commun : " : "Club en commun : "}
          {p.commonClubs.map((c) => c.name).join(", ")}
        </p>
      </div>

      {p.hidden ? (
        <p className={`${card} text-ink-muted`} data-testid="member-hidden">
          Ce membre a choisi de masquer son profil.
        </p>
      ) : (
        <>
          {p.licences.length > 0 && (
            <div className={card} data-testid="member-licences">
              <h2 className="font-serif text-xl text-primary">Joueur du club</h2>
              <ul className="divide-y divide-line">
                {p.licences.map((l) => (
                  <li key={l.clubName} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="font-medium">{l.clubName}</span>
                    <span className="text-sm text-ink-muted">
                      {l.rankLabel}
                      {l.teams.length > 0 && ` · ${l.teams.join(", ")}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className={card} data-testid="member-stats">
            <h2 className="font-serif text-xl text-primary">Classement et pronostics</h2>
            <ul className="divide-y divide-line">
              {p.ranks.map((r) => (
                <li key={r.clubId} className="flex flex-wrap items-center justify-between gap-2 py-2" data-testid="member-rank">
                  <span className="font-medium">{r.clubName}</span>
                  <span className="text-sm text-ink-muted">{r.rank === null ? "Pas encore classé sur la saison" : `${r.rank}${r.rank === 1 ? "er" : "e"} sur ${r.ofTotal}`}</span>
                </li>
              ))}
            </ul>
            {p.stats.settled === 0 ? (
              <p className="text-ink-muted">Aucun pronostic terminé dans vos clubs pour l&apos;instant.</p>
            ) : (
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-ink-muted">Pronostics terminés</dt>
                  <dd className="font-semibold" data-testid="member-settled">{p.stats.settled}</dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Réussite</dt>
                  <dd className="font-semibold" data-testid="member-hit-rate">{p.stats.hitRate} %</dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Bénéfice</dt>
                  <dd className="font-semibold" data-testid="member-net">{signedAces(p.stats.netAces)}</dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Série en cours</dt>
                  <dd className="font-semibold">{streak ?? "—"}</dd>
                </div>
              </dl>
            )}
          </div>

          <div className={card} data-testid="member-results">
            <h2 className="font-serif text-xl text-primary">Derniers pronostics terminés</h2>
            {p.results.length === 0 ? (
              <p className="text-ink-muted">Aucun pronostic terminé pour l&apos;instant.</p>
            ) : (
              <ul className="divide-y divide-line">
                {p.results.map((r) => (
                  <li key={r.id} className="space-y-1 py-3" data-testid="member-result" data-status={r.status}>
                    <p className="text-sm text-ink-muted">{r.title}</p>
                    <p className="font-medium">{r.matchLabel}</p>
                    <p className="text-sm">
                      A pronostiqué <strong>{r.pickedName}</strong> (cote {r.odds}) · {r.committedAces} Aces engagés ·{" "}
                      <span className="font-semibold">
                        {STATUS[r.status]}
                        {r.status === "WON" && r.payoutAces !== null && ` : ${r.payoutAces} Aces gagnés`}
                        {r.status === "REFUNDED" && " : Aces rendus"}
                      </span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {p.hasMore && (
              <Link href={`/membres/${p.user.id}?limite=${limit + PROFILE_RECENT}`} scroll={false} className="inline-flex min-h-11 items-center font-semibold text-primary underline" data-testid="member-more">
                Voir plus
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}
