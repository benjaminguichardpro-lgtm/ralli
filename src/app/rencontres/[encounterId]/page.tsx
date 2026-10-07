import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  AddMatchForm,
  CancelForm,
  DeleteDraftForm,
  EditMatchForm,
  PublishForm,
  RescheduleForm,
} from "@/components/encounter-forms";
import { PredictionForm } from "@/components/prediction-form";
import { StatusBadge } from "@/components/encounter-list";
import { getCurrentUser } from "@/lib/auth/current-user";
import { formatParis, toParisLocalInput } from "@/lib/time";
import { type EncounterPageView, getEncounterPage } from "@/server/encounters";
import { DomainError } from "@/server/errors";
import { getPredictionPanel } from "@/server/predictions";
import { predictionSideLabel } from "@/lib/predictions/labels";

// Page publique (lien partageable) : jamais indexée par les moteurs de recherche (décision 23).
export const metadata: Metadata = { title: "Rencontre · Ralli", robots: { index: false, follow: false } };

export default function EncounterPage({ params }: { params: Promise<{ encounterId: string }> }) {
  return (
    <Suspense fallback={<p className="text-ink-muted">Chargement…</p>}>
      <Encounter params={params} />
    </Suspense>
  );
}

async function Encounter({ params }: { params: Promise<{ encounterId: string }> }) {
  const { encounterId } = await params;
  const viewer = await getCurrentUser(); // facultatif : la page publiée est visible sans compte
  let e: EncounterPageView;
  try {
    e = await getEncounterPage(viewer?.id ?? null, encounterId);
  } catch (err) {
    if (err instanceof DomainError && err.code === "NOT_FOUND") notFound();
    throw err;
  }
  const panel = await getPredictionPanel(viewer?.id ?? null, encounterId);
  const published = e.status !== "DRAFT";
  const m = e.manage;

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <StatusBadge status={e.status} label={e.statusLabel} />
        <h1 className="font-serif text-2xl text-primary">
          <span className="block">{e.home}</span>
          <span className="block text-base text-ink-muted">contre</span>
          <span className="block">{e.away}</span>
        </h1>
        <p className="text-ink-muted">
          <span className="sr-only">Début : </span>
          <span data-testid="starts-at">{formatParis(e.startsAt)}</span>
          {e.status === "LOCKED" && e.predictionsCloseAt.getTime() !== e.startsAt.getTime() && (
            <span className="block text-sm">Rencontre reportée : les pronostics sont restés fermés.</span>
          )}
        </p>
      </div>

      <div className="space-y-3 rounded-xl bg-surface p-4 shadow-sm">
        <h2 className="font-serif text-xl text-primary">Matchs en simple</h2>
        {e.matches.length === 0 ? (
          <p className="text-ink-muted">Aucun match pour l&apos;instant.</p>
        ) : (
          <ol className="divide-y divide-canvas" data-testid="matches">
            {e.matches.map((x) => (
              <li key={x.id} className="space-y-2 py-3">
                <p className="text-sm text-ink-muted">Simple {x.number}</p>
                <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2">
                  <span>
                    <span className="font-medium">{x.home.name}</span> <span className="text-sm text-ink-muted">({x.home.rank})</span>
                  </span>
                  {x.oddsHome && (
                    <span data-testid="odds" className="rounded-full bg-accent px-3 py-1 text-sm font-semibold text-on-accent">
                      {x.oddsHome}
                    </span>
                  )}
                  <span>
                    <span className="font-medium">{x.away.name}</span> <span className="text-sm text-ink-muted">({x.away.rank})</span>
                  </span>
                  {x.oddsAway && (
                    <span data-testid="odds" className="rounded-full bg-accent px-3 py-1 text-sm font-semibold text-on-accent">
                      {x.oddsAway}
                    </span>
                  )}
                </div>
                <PredictionArea
                  match={x}
                  open={e.status === "OPEN"}
                  loggedIn={viewer !== null}
                  panel={panel}
                />
              </li>
            ))}
          </ol>
        )}
        {!published && <p className="text-sm text-ink-muted">Les cotes seront calculées à la publication.</p>}
      </div>

      {m && (
        <div className="space-y-4 rounded-xl bg-surface p-4 shadow-sm" data-testid="manage">
          <h2 className="font-serif text-xl text-primary">Gestion de la rencontre</h2>

          {m.canPublish && (
            <PublishForm encounterId={e.id} />
          )}

          {m.canEditComposition && (
            <>
              {m.matches.map((x, i) => (
                <details key={x.id} className="border-t border-canvas pt-2">
                  <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-primary">
                    Modifier le simple {i + 1}
                  </summary>
                  <EditMatchForm match={x} homeRoster={m.homeRoster} awayRoster={m.awayRoster} published={published} />
                </details>
              ))}
              {published ? (
                <details className="border-t border-canvas pt-2" data-testid="add-match">
                  <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-primary">Ajouter un match</summary>
                  <AddMatchForm encounterId={e.id} homeRoster={m.homeRoster} awayRoster={m.awayRoster} published />
                </details>
              ) : (
                // Brouillon : composer est la tâche principale, le formulaire reste ouvert.
                <div className="space-y-2 border-t border-canvas pt-3" data-testid="add-match">
                  <h3 className="font-semibold text-primary">Ajouter un match</h3>
                  <AddMatchForm encounterId={e.id} homeRoster={m.homeRoster} awayRoster={m.awayRoster} published={false} />
                </div>
              )}
            </>
          )}

          {m.canReschedule && (
            <details className="border-t border-canvas pt-2">
              <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-primary">Reporter</summary>
              <RescheduleForm encounterId={e.id} currentLocal={toParisLocalInput(e.startsAt)} locked={e.status === "LOCKED"} />
            </details>
          )}

          {m.canCancel && (
            <details className="border-t border-canvas pt-2">
              <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-primary">Annuler la rencontre</summary>
              <CancelForm encounterId={e.id} />
            </details>
          )}

          {m.canDelete && (
            <div className="border-t border-canvas pt-3">
              <DeleteDraftForm encounterId={e.id} />
            </div>
          )}
        </div>
      )}

      {viewer && (
        <Link href={`/clubs/${e.clubId}`} className="inline-flex min-h-11 items-center font-semibold text-primary underline">
          Voir le club
        </Link>
      )}
    </section>
  );
}

function PredictionArea({
  match,
  open,
  loggedIn,
  panel,
}: {
  match: EncounterPageView["matches"][number];
  open: boolean;
  loggedIn: boolean;
  panel: Awaited<ReturnType<typeof getPredictionPanel>>;
}) {
  const mine = panel.mine[match.id];
  if (mine) {
    const picked = mine.side === "HOME" ? match.home.name : match.away.name;
    return (
      <p data-testid="my-prediction" className="rounded-lg bg-canvas p-3 text-sm">
        Votre pronostic : <strong>{picked}</strong>, {mine.committedAces.toLocaleString("fr-FR")} Aces engagés à la cote {mine.odds}.{" "}
        {predictionSideLabel(mine.status, mine.payoutAces)}
      </p>
    );
  }
  if (!open || !match.oddsHome || !match.oddsAway) return null;
  if (!loggedIn) {
    return (
      <p className="text-sm text-ink-muted">
        <Link href="/connexion" className="font-semibold text-primary underline">
          Connectez-vous
        </Link>{" "}
        pour pronostiquer.
      </p>
    );
  }
  if (!panel.isMember) return <p className="text-sm text-ink-muted">Réservé aux membres du club organisateur.</p>;
  if (panel.blockedReason) return <p className="text-sm text-ink-muted" data-testid="blocked">{panel.blockedReason}</p>;
  return (
    <details data-testid="predict">
      <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-primary">Pronostiquer ce match</summary>
      <PredictionForm
        matchId={match.id}
        homeName={match.home.name}
        awayName={match.away.name}
        oddsHome={match.oddsHome}
        oddsAway={match.oddsAway}
        balance={panel.balance}
      />
    </details>
  );
}
