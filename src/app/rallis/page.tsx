import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ResultFilters } from "@/components/result-filters";
import { ButtonLink } from "@/components/ui";
import { requireUser } from "@/lib/auth/current-user";
import { PAGE_SIZE, formatDelta, hitsSentence, isRecentResult, parseLimit, parseResultFilter, resultLine, streakLabel } from "@/lib/predictions/results";
import { formatParis, formatParisDay } from "@/lib/time";
import { getWallet } from "@/server/predictions";
import { getResults } from "@/server/results";

export const metadata: Metadata = { title: "Mes rallis · Ralli" };

type Props = { searchParams: Promise<{ statut?: string | string[]; limite?: string | string[] }> };

export default function MyRallisPage(props: Props) {
  return (
    <Suspense fallback={<p className="text-ink-muted">Chargement…</p>}>
      <MyRallis {...props} />
    </Suspense>
  );
}

const TONE = { won: "text-success-ink", lost: "text-danger", neutral: "text-ink-muted" } as const;
const aces = (n: number) => `${n.toLocaleString("fr-FR")} Aces`;
const signed = (n: number) => `${n > 0 ? "+" : ""}${n.toLocaleString("fr-FR")} Aces`;

async function MyRallis({ searchParams }: Props) {
  const user = await requireUser();
  const sp = await searchParams;
  const filter = parseResultFilter(sp.statut);
  const limit = parseLimit(sp.limite);
  const [r, w] = await Promise.all([getResults(user.id, filter, limit), getWallet(user.id)]);
  const s = r.summary;
  const now = new Date();
  const moreHref = `/rallis?${filter === "tous" ? "" : `statut=${filter}&`}limite=${limit + PAGE_SIZE}`;

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-serif text-3xl text-primary">Mes rallis</h1>
        <p className="text-ink-muted">Tes rallis en cours et terminés, dans tous tes clubs.</p>
      </div>

      <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm" data-testid="pending-section">
        <h2 className="font-serif text-xl text-primary">En cours</h2>
        {w.pending.length === 0 ? (
          <p className="text-ink-muted">Aucun ralli en attente de résultat.</p>
        ) : (
          <>
            <ul className="divide-y divide-line" data-testid="pending">
              {w.pending.map((p) => (
                <li key={p.id}>
                  <Link href={`/rencontres/${p.encounterId}`} className="block min-h-11 py-2">
                    <span className="font-medium text-primary">{p.matchLabel}</span>
                    <span className="block text-sm text-ink-muted">
                      Ton ralli : {p.pickedName}, {aces(p.committedAces)} engagés à la cote {p.odds}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="text-sm text-ink-muted" data-testid="pending-aces">
              Dont engagés en attente de résultat : {aces(w.pendingAces)} (déjà déduits de ton solde).
            </p>
          </>
        )}
      </div>

      <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm" data-testid="results-summary">
        <p className="font-serif text-2xl font-semibold text-primary" data-testid="results-hits">
          {hitsSentence(s)}
          {s.hitRate !== null && <span className="font-sans text-base font-medium text-ink-muted"> · {s.hitRate} % de réussite</span>}
        </p>
        {streakLabel(r.streak) && (
          <p className="inline-block rounded-full bg-gold px-3 py-1 text-sm font-bold text-on-gold" data-testid="results-streak">
            {streakLabel(r.streak)}
          </p>
        )}
        <dl className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-pale p-2">
            <dt className="text-xs text-ink-muted">Aces engagés</dt>
            <dd className="font-data font-bold" data-testid="results-committed">{aces(s.committedAces)}</dd>
          </div>
          <div className="rounded-xl bg-pale p-2">
            <dt className="text-xs text-ink-muted">Aces gagnés</dt>
            <dd className="font-data font-bold" data-testid="results-won-aces">{aces(s.wonAces)}</dd>
          </div>
          <div className="rounded-xl bg-pale p-2">
            <dt className="text-xs text-ink-muted">Bénéfice net</dt>
            <dd className={`font-data font-bold ${s.netAces > 0 ? "text-success-ink" : s.netAces < 0 ? "text-danger" : ""}`} data-testid="results-net">
              {formatDelta(s.netAces)}
            </dd>
          </div>
        </dl>
        {s.refunded > 0 && (
          <p className="text-sm text-ink-muted" data-testid="results-refunded-note">
            {s.refunded} ralli{s.refunded > 1 ? "s" : ""} remboursé{s.refunded > 1 ? "s" : ""} (annulation ou match remplacé) : non compté{s.refunded > 1 ? "s" : ""} dans ces chiffres.
          </p>
        )}
      </div>

      {r.counts.tous === 0 ? (
        <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm" data-testid="results-empty">
          <p className="text-ink-muted">Aucun ralli terminé pour l&apos;instant. Valide un ralli sur une rencontre : son résultat apparaîtra ici dès que le score sera confirmé.</p>
          <ButtonLink href="/">Voir les matchs</ButtonLink>
        </div>
      ) : (
        <>
          <ResultFilters current={filter} counts={r.counts} />
          {r.groups.length === 0 ? (
            <p className="text-ink-muted" data-testid="results-empty-filter">Aucun ralli dans cette catégorie.</p>
          ) : (
            <div className="space-y-4" data-testid="results-list">
              {r.groups.map((g) => (
                <div key={g.encounterId} className="space-y-1 rounded-2xl bg-surface p-4 shadow-sm" data-testid="result-group">
                  <h2 className="font-serif text-xl text-primary">{g.title}</h2>
                  <p className="text-sm text-ink-muted">{formatParisDay(g.startsAt)}</p>
                  <ul className="divide-y divide-line">
                    {g.items.map((p) => {
                      const line = resultLine(p);
                      const recent = isRecentResult(p.settledAt, now);
                      return (
                        <li key={p.id} data-testid="result-item" data-recent={recent ? "true" : undefined} className={recent && p.status === "WON" ? "won-new" : undefined}>
                          <Link href={`/rencontres/${p.encounterId}`} className="flex min-h-11 items-center justify-between gap-3 py-2">
                            <span>
                              <span className="block font-medium">
                                {p.matchLabel}
                                {recent && (
                                  <span className="ml-2 rounded-full bg-gold px-2 py-0.5 align-middle text-xs font-bold text-on-gold" data-testid="new-tag">
                                    Nouveau
                                  </span>
                                )}
                              </span>
                              <span className="block text-sm text-ink-muted">
                                Ton ralli : {p.pickedName}, {aces(p.committedAces)} engagés à la cote {p.odds}
                              </span>
                            </span>
                            <span className={`shrink-0 text-right font-semibold ${TONE[line.tone]}`}>
                              {line.label}
                              {line.delta && <span className="block font-data">{line.delta}</span>}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
          {r.hasMore && (
            <div className="flex justify-center">
              <ButtonLink href={moreHref} variant="ghost" className="min-w-48" scroll={false}>
                Voir plus
              </ButtonLink>
            </div>
          )}
        </>
      )}

      <details className="rounded-2xl bg-surface p-4 shadow-sm" data-testid="ledger-section">
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-serif text-xl text-primary">Historique des Aces</summary>
        <ul className="divide-y divide-line" data-testid="ledger">
          {w.entries.map((x) => (
            <li key={x.id} className="flex min-h-11 items-center justify-between gap-3 py-2">
              <span>
                {x.encounterId ? (
                  <Link href={`/rencontres/${x.encounterId}`} className="font-medium text-primary underline">
                    {x.label}
                  </Link>
                ) : (
                  <span className="font-medium">{x.label}</span>
                )}
                <span className="block text-sm text-ink-muted">{formatParis(x.createdAt)}</span>
              </span>
              <strong>{signed(x.amount)}</strong>
            </li>
          ))}
        </ul>
        <p className="pt-2 text-sm text-ink-muted">Les 50 derniers mouvements sont affichés.</p>
      </details>
    </section>
  );
}
