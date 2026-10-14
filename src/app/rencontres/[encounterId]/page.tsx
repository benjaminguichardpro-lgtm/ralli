import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import {
  AddDoubleForm,
  AddMatchForm,
  CancelForm,
  DeleteDraftForm,
  EditMatchForm,
  PublishForm,
  RescheduleForm,
} from "@/components/encounter-forms";
import { JoinClubButton } from "@/components/club-directory";
import { type Access, MatchPicks } from "@/components/match-picks";
import { WhatsAppShare } from "@/components/share-link";
import { ConfirmScoreForm, DisputeScoreForm, LiveResultForm, ProposeScoreForm, ResolveDisputeForm, WithdrawScoreForm } from "@/components/score-forms";
import { StatusBadge } from "@/components/encounter-list";
import { getCurrentUser } from "@/lib/auth/current-user";
import { kindTitle, kindWord, pointsLabel } from "@/lib/matches";
import { predictorCountLabel } from "@/lib/predictions/labels";
import { formatParis, formatParisDay, formatParisTime, relativeDayLabel, toParisLocalInput } from "@/lib/time";
import { type EncounterPageView, getEncounterPage } from "@/server/encounters";
import { DomainError } from "@/server/errors";
import { getPredictionPanel } from "@/server/predictions";
import { type ScoreView, getScoreView } from "@/server/scores";
import { tournamentExists } from "@/server/tournaments";

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
    if (err instanceof DomainError && err.code === "NOT_FOUND") {
      // Les pronostics de tournoi (Mes rallis, portefeuille, récapitulatif) pointent ici avec l'identifiant du tournoi.
      if (await tournamentExists(encounterId)) redirect(`/tournois/${encounterId}`);
      notFound();
    }
    throw err;
  }
  const [panel, score] = await Promise.all([getPredictionPanel(viewer?.id ?? null, encounterId), getScoreView(viewer?.id ?? null, encounterId)]);
  const published = e.status !== "DRAFT";
  const rel = relativeDayLabel(e.startsAt, new Date());
  const m = e.manage;

  return (
    <section className="space-y-6">
      <div className="space-y-3 rounded-2xl bg-primary-dark p-5 text-on-primary">
        <StatusBadge status={e.status} label={e.statusLabel} onDark />
        <h1 className="font-serif text-2xl font-semibold leading-tight">
          <span className="block">{e.home}</span>
          <span className="block text-base font-normal text-on-primary-soft">contre</span>
          <span className="block">{e.away}</span>
        </h1>
        <p className="flex flex-wrap items-baseline gap-x-3">
          <span className="sr-only">Début : </span>
          <span className="font-figures text-4xl font-bold leading-none">{formatParisTime(e.startsAt)}</span>
          <span className="text-lg font-semibold">
            {formatParisDay(e.startsAt)}
            {rel && <span className="font-normal text-on-primary-soft"> · {rel}</span>}
          </span>
          {/* Texte complet pour les tests et les lecteurs d'écran. */}
          <span data-testid="starts-at" className="sr-only">
            {formatParis(e.startsAt)}
          </span>
        </p>
        {e.status === "LOCKED" && e.predictionsCloseAt.getTime() !== e.startsAt.getTime() && (
          <p className="text-sm text-on-primary-soft">Rencontre reportée : les pronostics sont restés fermés.</p>
        )}
      </div>
      {score.live && score.tally && (
        <div className="space-y-1 rounded-2xl border-2 border-accent bg-pale p-4 text-center" data-testid="tally">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
            <span aria-hidden="true">● </span>Score en direct
          </p>
          <p className="font-figures text-5xl font-bold leading-none text-primary">
            {score.tally.home} – {score.tally.away}
          </p>
          <p className="text-sm font-medium">
            {e.home} – {e.away}
          </p>
        </div>
      )}
      {published && e.status !== "CANCELLED" && (
        <WhatsAppShare
          text={`${e.home} – ${e.away}, ${formatParisDay(e.startsAt)} à ${formatParisTime(e.startsAt)} 🎾 Fais ton pronostic sur Ralli (jeu gratuit, sans argent réel) :`}
          path={`/rencontres/${e.id}`}
          label="Partager la rencontre"
        />
      )}

      {viewer && !panel.isMember && e.status === "OPEN" && (
        <div className="space-y-2 rounded-2xl bg-pale p-4" data-testid="join-to-predict">
          <p className="font-medium text-ink">Tu peux consulter les matchs et leurs cotes. Pour pronostiquer, rejoins d&apos;abord le club.</p>
          <JoinClubButton clubId={e.clubId} />
        </div>
      )}

      <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
        <h2 className="font-serif text-xl text-primary">Matchs</h2>
        {e.matches.length === 0 ? (
          <p className="text-ink-muted">Aucun match pour l&apos;instant.</p>
        ) : (
          <ol className="divide-y divide-line" data-testid="matches">
            {e.matches.map((x) => (
              <li key={x.id} className="space-y-2 py-3">
                <p className="text-sm text-ink-muted">
                  {kindTitle(x.kind)} {x.number}
                  {x.points > 1 && ` · ${pointsLabel(x.points)}`}
                </p>
                <MatchPicks
                  matchId={x.id}
                  home={{ name: x.home.name, rank: x.home.rank, oddsX100: x.oddsHomeX100, odds: x.oddsHome }}
                  away={{ name: x.away.name, rank: x.away.rank, oddsX100: x.oddsAwayX100, odds: x.oddsAway }}
                  access={accessFor(e, viewer !== null, panel)}
                  mine={panel.mine[x.id] ?? null}
                  share={{ title: `${e.home} – ${e.away}`, whenLabel: `${formatParisDay(e.startsAt)} à ${formatParisTime(e.startsAt)}`, path: `/rencontres/${e.id}` }}
                />
                {predictorCountLabel(x.predictorCount) && (
                  <p className="text-sm text-ink-muted" data-testid="predictor-count">
                    {predictorCountLabel(x.predictorCount)}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
        {!published && <p className="text-sm text-ink-muted">Les cotes seront calculées à la publication.</p>}
      </div>

      <ScoreSection e={e} score={score} />

      {m && (
        <div className="space-y-4 rounded-2xl bg-surface p-4 shadow-sm" data-testid="manage">
          <h2 className="font-serif text-xl text-primary">Gestion de la rencontre</h2>

          {m.canPublish && (
            <PublishForm encounterId={e.id} />
          )}

          {m.canEditComposition && (
            <>
              {m.matches.map((x) => (
                <details key={x.id} className="border-t border-line pt-2">
                  <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-primary">
                    Modifier le {kindWord(x.kind)} {x.number}
                  </summary>
                  <EditMatchForm match={x} homeRoster={m.homeRoster} awayRoster={m.awayRoster} published={published} />
                </details>
              ))}
              {published ? (
                <>
                  <details className="border-t border-line pt-2" data-testid="add-match">
                    <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-primary">Ajouter un simple</summary>
                    <AddMatchForm encounterId={e.id} homeRoster={m.homeRoster} awayRoster={m.awayRoster} published />
                  </details>
                  <details className="border-t border-line pt-2" data-testid="add-double">
                    <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-primary">Ajouter un double</summary>
                    <AddDoubleForm encounterId={e.id} homeRoster={m.homeRoster} awayRoster={m.awayRoster} published />
                  </details>
                </>
              ) : (
                // Brouillon : composer est la tâche principale, les formulaires restent ouverts (le double dans un bloc repliable).
                <>
                  <div className="space-y-2 border-t border-line pt-3" data-testid="add-match">
                    <h3 className="font-semibold text-primary">Ajouter un simple</h3>
                    <AddMatchForm encounterId={e.id} homeRoster={m.homeRoster} awayRoster={m.awayRoster} published={false} />
                  </div>
                  <details className="border-t border-line pt-2" data-testid="add-double">
                    <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-primary">Ajouter un double</summary>
                    <AddDoubleForm encounterId={e.id} homeRoster={m.homeRoster} awayRoster={m.awayRoster} published={false} />
                  </details>
                </>
              )}
            </>
          )}

          {m.canReschedule && (
            <details className="border-t border-line pt-2">
              <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-primary">Reporter</summary>
              <RescheduleForm encounterId={e.id} currentLocal={toParisLocalInput(e.startsAt)} locked={e.status === "LOCKED"} />
            </details>
          )}

          {m.canCancel && (
            <details className="border-t border-line pt-2">
              <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-primary">Annuler la rencontre</summary>
              <CancelForm encounterId={e.id} />
            </details>
          )}

          {m.canDelete && (
            <div className="border-t border-line pt-3">
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

function accessFor(e: EncounterPageView, loggedIn: boolean, panel: Awaited<ReturnType<typeof getPredictionPanel>>): Access {
  if (e.status !== "OPEN") return { kind: "none" };
  if (!loggedIn) return { kind: "login" };
  if (!panel.isMember) return { kind: "note", text: "Rejoins le club pour pronostiquer." };
  if (panel.blockedReason) return { kind: "note", text: panel.blockedReason, testId: "blocked", explainOnTouch: true };
  return { kind: "predict", balance: panel.balance };
}

function ScoreSection({ e, score }: { e: EncounterPageView; score: ScoreView }) {
  const a = score.actions;
  const forms = score.matches.map((x) => ({
    id: x.id,
    kind: x.kind,
    number: x.number,
    points: x.points,
    home: x.home,
    away: x.away,
    result: x.result ? { outcome: x.result.outcome, winnerSide: x.result.winnerSide, sets: x.result.sets } : null,
  }));
  const hasForm = a.canPropose || a.canWithdraw || a.canConfirm || a.canDispute || a.canResolve;
  const show = e.status === "SCORE_PROPOSED" || e.status === "DISPUTED" || e.status === "CONFIRMED" || score.live || score.waitingStart || hasForm;
  if (!show) return null;
  return (
    <div className="space-y-4 rounded-2xl bg-surface p-4 shadow-sm" data-testid="score-section">
      <h2 className="font-serif text-xl text-primary">Score</h2>

      {score.tally && !score.live && (
        <p className="text-lg font-semibold" data-testid="tally">
          {score.provisional ? "Score provisoire" : "Score final"} : {e.home} {score.tally.home} – {score.tally.away} {e.away}
        </p>
      )}
      {score.provisional && (
        <p className="rounded-lg border-l-4 border-accent bg-pale p-3" data-testid="provisional-note">
          Score provisoire : il sera définitif quand un second admin ou capitaine l&apos;aura confirmé, et peut encore changer d&apos;ici là.
        </p>
      )}
      {score.live && (
        <p className="rounded-lg border-l-4 border-accent bg-pale p-3" data-testid="live-note">
          Score en direct : il se met à jour match par match. Il ne sera définitif qu&apos;après la proposition du score final et sa confirmation par une
          seconde personne ; les pronostics sont réglés à ce moment-là.
        </p>
      )}
      {score.waitingStart && (
        <p className="text-sm text-ink-muted" data-testid="live-not-started">
          La rencontre n&apos;a pas encore commencé : la saisie des résultats s&apos;ouvrira à {formatParisTime(e.startsAt)}.
        </p>
      )}
      {a.canRecordLive && !score.live && (
        <p className="text-sm text-ink-muted" data-testid="live-hint">
          La rencontre a commencé : saisis le résultat de chaque match dès qu&apos;il est terminé, le score s&apos;affiche en direct.
        </p>
      )}
      {e.status === "DISPUTED" && !score.resultsVisible && <p data-testid="score-pending">Score contesté : un admin du club va trancher.</p>}

      {score.resultsVisible && (
        <ol className="divide-y divide-line" data-testid="results">
          {score.matches.map((x) => (
            <li key={x.id} className="py-2">
              <p className="text-sm text-ink-muted">
                {kindTitle(x.kind)} {x.number} : {x.home} contre {x.away}
                {x.points > 1 && ` · ${pointsLabel(x.points)}`}
              </p>
              {x.result ? (
                <p>
                  {x.result.winnerName ? <strong>{x.result.winnerName}</strong> : <strong>Pas de vainqueur</strong>} · {x.result.outcomeLabel}
                  {x.result.sets && <span> · {x.result.sets}</span>}
                </p>
              ) : (
                <p className="text-ink-muted">Pas de résultat saisi.</p>
              )}
              {a.canRecordLive && <LiveResultForm match={forms.find((f) => f.id === x.id)!} />}
            </li>
          ))}
        </ol>
      )}

      {score.proposedBy && (
        <p className="text-sm text-ink-muted" data-testid="proposed-by">
          Proposé par {score.proposedBy}.
        </p>
      )}
      {score.disputeReason && (
        <p className="rounded-lg border-l-4 border-accent bg-pale p-3" data-testid="dispute-reason">
          Motif de la contestation : {score.disputeReason}
        </p>
      )}

      {a.canPropose && (
        <details className="border-t border-line pt-2" data-testid="propose-score">
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-primary">Proposer le score</summary>
          <ProposeScoreForm encounterId={e.id} matches={forms} />
        </details>
      )}
      {a.canConfirm && <ConfirmScoreForm encounterId={e.id} />}
      {a.canDispute && (
        <details className="border-t border-line pt-2" data-testid="dispute-score">
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-primary">Contester le score</summary>
          <DisputeScoreForm encounterId={e.id} />
        </details>
      )}
      {a.canWithdraw && <WithdrawScoreForm encounterId={e.id} />}
      {a.canResolve && (
        <details className="space-y-3 border-t border-line pt-3" open data-testid="resolve-dispute">
          <summary className="flex min-h-12 cursor-pointer items-center justify-center rounded-lg bg-primary px-4 font-semibold text-on-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            Trancher le litige
          </summary>
          <ResolveDisputeForm encounterId={e.id} matches={forms} />
        </details>
      )}

      {score.journal.length > 0 && (
        <details className="border-t border-line pt-2" data-testid="journal">
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-primary">Journal de la rencontre</summary>
          <ul className="space-y-1 pt-2 text-sm">
            {score.journal.map((j) => (
              <li key={j.id}>
                <span className="text-ink-muted">{formatParis(j.at)} · {j.actor} :</span> {j.text}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
