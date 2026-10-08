import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth/current-user";
import { predictionSideLabel } from "@/lib/predictions/labels";
import { formatParis } from "@/lib/time";
import { getWallet } from "@/server/predictions";

export const metadata: Metadata = { title: "Mon portefeuille · Ralli" };

export default function WalletPage() {
  return (
    <Suspense fallback={<p className="text-ink-muted">Chargement…</p>}>
      <Wallet />
    </Suspense>
  );
}

const aces = (n: number) => `${n > 0 ? "+" : ""}${n.toLocaleString("fr-FR")} Aces`;

async function Wallet() {
  const user = await requireUser();
  const w = await getWallet(user.id);
  return (
    <section className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl text-primary">Mon portefeuille</h1>
        <p className="text-ink-muted">
          Solde disponible : <strong data-testid="wallet-balance" className="font-data text-ink">{w.balance.toLocaleString("fr-FR")} Aces</strong>
        </p>
        {w.pendingAces > 0 && (
          <p className="text-sm text-ink-muted" data-testid="pending-aces">
            Dont engagés en attente de résultat : {w.pendingAces.toLocaleString("fr-FR")} Aces (déjà déduits du solde).
          </p>
        )}
      </div>

      <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
        <h2 className="font-serif text-xl text-primary">Pronostics en cours</h2>
        {w.pending.length === 0 ? (
          <p className="text-ink-muted">Aucun pronostic en attente.</p>
        ) : (
          <ul className="divide-y divide-line" data-testid="pending">
            {w.pending.map((p) => (
              <li key={p.id}>
                <Link href={`/rencontres/${p.encounterId}`} className="block min-h-11 py-2">
                  <span className="font-medium text-primary">{p.matchLabel}</span>
                  <span className="block text-sm text-ink-muted">
                    Vous : {p.pickedName}, {p.committedAces.toLocaleString("fr-FR")} Aces engagés à la cote {p.odds}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
        <h2 className="font-serif text-xl text-primary">Pronostics terminés</h2>
        {w.settled.length === 0 ? (
          <p className="text-ink-muted">Aucun pronostic terminé pour l&apos;instant.</p>
        ) : (
          <ul className="divide-y divide-line" data-testid="settled">
            {w.settled.map((p) => (
              <li key={p.id}>
                <Link href={`/rencontres/${p.encounterId}`} className="block min-h-11 py-2">
                  <span className="font-medium text-primary">{p.matchLabel}</span>
                  <span className="block text-sm text-ink-muted">
                    Vous : {p.pickedName}, {p.committedAces.toLocaleString("fr-FR")} Aces engagés à la cote {p.odds}
                  </span>
                  <span className="block text-sm font-semibold">{predictionSideLabel(p.status, p.payoutAces)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
        <h2 className="font-serif text-xl text-primary">Historique</h2>
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
              <strong>{aces(x.amount)}</strong>
            </li>
          ))}
        </ul>
        <p className="text-sm text-ink-muted">Les 50 derniers mouvements sont affichés.</p>
      </div>
    </section>
  );
}
