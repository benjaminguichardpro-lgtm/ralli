import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { JoinClubButton } from "@/components/club-directory";
import { type Access, MatchPicks } from "@/components/match-picks";
import { WhatsAppShare } from "@/components/share-link";
import {
  AddEntryForm,
  AddNewEntryForm,
  CancelTournamentForm,
  DeleteDraftTournamentForm,
  FirstRoundForm,
  MatchTimeForm,
  PublishTournamentForm,
  RemoveEntryForm,
  TournamentResultForm,
} from "@/components/tournament-forms";
import { StatusBadge } from "@/components/encounter-list";
import { getCurrentUser } from "@/lib/auth/current-user";
import { matchRoundName, roundName } from "@/lib/tournaments/bracket";
import { formatParisDay, formatParisTime, toParisLocalInput } from "@/lib/time";
import { DomainError } from "@/server/errors";
import { type TournamentMatchView, type TournamentPageView, getTournamentPage, getTournamentPanel } from "@/server/tournaments";

// Page publique (lien partageable) : jamais indexée, comme les pages de rencontre.
export const metadata: Metadata = { title: "Tournoi · Ralli", robots: { index: false, follow: false } };

export default function TournamentPage({ params }: { params: Promise<{ tournamentId: string }> }) {
  return (
    <Suspense fallback={<p className="text-ink-muted">Chargement…</p>}>
      <Tournament params={params} />
    </Suspense>
  );
}

type Panel = Awaited<ReturnType<typeof getTournamentPanel>>;

async function Tournament({ params }: { params: Promise<{ tournamentId: string }> }) {
  const { tournamentId } = await params;
  const viewer = await getCurrentUser(); // facultatif : un tournoi publié est visible sans compte
  let t: TournamentPageView;
  try {
    t = await getTournamentPage(viewer?.id ?? null, tournamentId);
  } catch (e) {
    if (e instanceof DomainError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const panel = await getTournamentPanel(viewer?.id ?? null, tournamentId);
  const now = new Date();
  const published = t.status !== "DRAFT";
  const badge = t.status === "OPEN" ? "OPEN" : t.status === "FINISHED" ? "CONFIRMED" : t.status === "CANCELLED" ? "CANCELLED" : "DRAFT";

  return (
    <section className="space-y-6" data-testid="tournament-page">
      <div className="space-y-3 rounded-2xl bg-primary-dark p-5 text-on-primary">
        <StatusBadge status={badge} label={t.statusLabel} onDark />
        <h1 className="font-serif text-2xl font-semibold leading-tight" data-testid="tournament-name">
          {t.name}
        </h1>
        <p className="text-on-primary-soft">
          Tournoi du{" "}
          <Link href={`/clubs/${t.clubId}`} className="font-semibold text-on-primary underline">
            {t.clubName}
          </Link>{" "}
          · {t.drawSize} joueurs · {formatParisDay(t.startsAt)}
        </p>
      </div>

      {t.winner && (
        <div className="rounded-2xl border-2 border-accent bg-pale p-4 text-center" data-testid="tournament-winner">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Vainqueur du tournoi</p>
          <p className="font-serif text-3xl font-semibold text-primary">{t.winner}</p>
        </div>
      )}
      {t.status === "CANCELLED" && <p className="rounded-lg border-l-4 border-accent bg-pale p-3">Ce tournoi est annulé : les pronostics en cours ont été remboursés.</p>}

      {published && t.status !== "CANCELLED" && <WhatsAppShare text={`${t.name} 🎾 Suis le tableau et fais tes pronostics sur Ralli (jeu gratuit, sans argent réel) :`} path={`/tournois/${t.id}`} label="Partager le tournoi" />}

      {viewer && !panel.isMember && t.status === "OPEN" && (
        <div className="space-y-2 rounded-2xl bg-pale p-4" data-testid="join-to-predict">
          <p className="font-medium text-ink">Tu peux suivre le tableau et les cotes. Pour pronostiquer, rejoins d&apos;abord le club.</p>
          <JoinClubButton clubId={t.clubId} />
        </div>
      )}

      {t.isAdmin && t.status === "DRAFT" && <DraftSection t={t} />}

      {published &&
        t.rounds.map((r) => (
          <div key={r.round} className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm" data-testid={`round-${r.round}`}>
            <h2 className="font-serif text-xl text-primary">{roundName(t.drawSize, r.round)}</h2>
            <ol className="divide-y divide-line">
              {r.matches.map((m) => (
                <MatchCard key={m.id} t={t} m={m} panel={panel} loggedIn={viewer !== null} now={now} />
              ))}
            </ol>
          </div>
        ))}

      {t.isAdmin && t.status === "OPEN" && (
        <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm" data-testid="tournament-manage">
          <h2 className="font-serif text-xl text-primary">Gestion du tournoi</h2>
          <p className="text-sm text-ink-muted">Fixe l&apos;heure de chaque match dès que ses joueurs sont connus, puis saisis le résultat une fois le match joué : il règle les pronostics et fait avancer le vainqueur.</p>
          <CancelTournamentForm tournamentId={t.id} />
        </div>
      )}
    </section>
  );
}

function accessFor(t: TournamentPageView, m: TournamentMatchView, loggedIn: boolean, panel: Panel): Access {
  if (m.state !== "open") return { kind: "none" };
  if (!loggedIn) return { kind: "login" };
  if (!panel.isMember) return { kind: "note", text: "Rejoins le club pour pronostiquer." };
  if (panel.blockedReason) return { kind: "note", text: panel.blockedReason, testId: "blocked", explainOnTouch: true };
  return { kind: "predict", balance: panel.balance };
}

const STATE_TEXT: Record<TournamentMatchView["state"], string> = {
  waiting: "Joueurs à venir",
  "needs-time": "Heure à fixer",
  open: "Pronostics ouverts",
  closed: "En cours",
  done: "Terminé",
};

function MatchCard({ t, m, panel, loggedIn, now }: { t: TournamentPageView; m: TournamentMatchView; panel: Panel; loggedIn: boolean; now: Date }) {
  const started = m.startsAt !== null && m.startsAt.getTime() <= now.getTime();
  const title = `${matchRoundName(t.drawSize, m.round)} ${t.rounds[m.round - 1]!.matches.length > 1 ? m.position + 1 : ""}`.trim();
  return (
    <li className="space-y-2 py-3" data-testid="tournament-match" data-state={m.state}>
      <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm text-ink-muted">
        <span>{title}</span>
        <span>
          {m.startsAt ? `${formatParisDay(m.startsAt)} à ${formatParisTime(m.startsAt)}` : ""} · <span data-testid="match-state">{STATE_TEXT[m.state]}</span>
        </span>
      </p>
      {m.home && m.away ? (
        m.state === "done" && m.result ? (
          <p>
            <span className={m.result.winnerSide === "HOME" ? "font-bold" : ""}>{m.home.name}</span> contre <span className={m.result.winnerSide === "AWAY" ? "font-bold" : ""}>{m.away.name}</span>
            <span className="block" data-testid="match-result">
              <strong>{m.result.winnerName}</strong> gagne{m.result.sets ? ` · ${m.result.sets}` : ""}
            </span>
          </p>
        ) : (
          <MatchPicks
            matchId={m.id}
            home={{ name: m.home.name, rank: m.home.rank, oddsX100: m.oddsHomeX100, odds: m.oddsHome }}
            away={{ name: m.away.name, rank: m.away.rank, oddsX100: m.oddsAwayX100, odds: m.oddsAway }}
            access={accessFor(t, m, loggedIn, panel)}
            mine={panel.mine[m.id] ?? null}
            share={{ title: `${t.name} · ${title}`, whenLabel: m.startsAt ? `${formatParisDay(m.startsAt)} à ${formatParisTime(m.startsAt)}` : "", path: `/tournois/${t.id}` }}
          />
        )
      ) : (
        <p className="text-ink-muted">
          {m.home?.name ?? "À déterminer"} contre {m.away?.name ?? "à déterminer"}
        </p>
      )}
      {m.state === "done" && panel.mine[m.id] && (
        <p className="rounded-lg bg-pale p-3 text-sm" data-testid="my-prediction">
          Ton pronostic : <strong>{panel.mine[m.id]!.side === "HOME" ? m.home?.name : m.away?.name}</strong>, {panel.mine[m.id]!.committedAces.toLocaleString("fr-FR")} Aces engagés à la cote {panel.mine[m.id]!.odds}.
        </p>
      )}
      {t.isAdmin && t.status === "OPEN" && m.state !== "done" && (
        <div className="space-y-2 pt-1">
          {!started && (
            <details className="rounded-lg border border-line px-3">
              <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-primary" data-testid="time-open">
                {m.startsAt ? "Changer l'heure" : "Fixer l'heure"}
              </summary>
              <div className="pb-3">
                <MatchTimeForm matchId={m.id} current={m.startsAt ? toParisLocalInput(m.startsAt) : ""} />
              </div>
            </details>
          )}
          {started && m.home && m.away && (
            <details className="rounded-lg border border-line px-3">
              <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-primary" data-testid="result-open">
                Saisir le résultat
              </summary>
              <div className="pb-3">
                <TournamentResultForm matchId={m.id} home={m.home.name} away={m.away.name} />
              </div>
            </details>
          )}
        </div>
      )}
    </li>
  );
}

/** Brouillon (admins) : inscrits, tableau du premier tour, publication. */
function DraftSection({ t }: { t: TournamentPageView }) {
  const first = t.rounds[0]!.matches;
  const full = t.entries.length === t.drawSize;
  return (
    <div className="space-y-6" data-testid="draft-section">
      <p className="rounded-lg border-l-4 border-accent bg-pale p-3">
        Brouillon : seuls les admins du club le voient. Inscris {t.drawSize} joueurs, compose le tableau du premier tour (joueurs et heures), puis publie.
      </p>

      <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm" data-testid="entries">
        <h2 className="font-serif text-xl text-primary">
          Joueurs inscrits <span data-testid="entries-count">{t.entries.length} / {t.drawSize}</span>
        </h2>
        {t.entries.length === 0 ? (
          <p className="text-ink-muted">Aucun joueur pour l&apos;instant.</p>
        ) : (
          <ul className="divide-y divide-line">
            {t.entries.map((e) => (
              <li key={e.playerId} className="flex items-center justify-between gap-3 py-1" data-testid="entry">
                <span>
                  {e.fullName} <span className="text-sm text-ink-muted">({e.rank})</span>
                </span>
                <RemoveEntryForm tournamentId={t.id} playerId={e.playerId} name={e.fullName} />
              </li>
            ))}
          </ul>
        )}
        {!full && (
          <>
            <AddEntryForm tournamentId={t.id} players={t.availablePlayers} />
            <details className="rounded-lg border border-line px-3">
              <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-primary">Ajouter un joueur extérieur au club</summary>
              <div className="pb-3">
                <AddNewEntryForm tournamentId={t.id} />
              </div>
            </details>
          </>
        )}
      </div>

      <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm" data-testid="first-round">
        <h2 className="font-serif text-xl text-primary">Tableau du premier tour</h2>
        {t.entries.length === 0 ? (
          <p className="text-ink-muted">Inscris d&apos;abord des joueurs.</p>
        ) : (
          <FirstRoundForm
            tournamentId={t.id}
            entries={t.entries}
            slots={first.map((m) => ({ position: m.position, homePlayerId: m.home?.id ?? null, awayPlayerId: m.away?.id ?? null, startsAtInput: m.startsAt ? toParisLocalInput(m.startsAt) : "" }))}
          />
        )}
      </div>

      <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
        <h2 className="font-serif text-xl text-primary">Publication</h2>
        <PublishTournamentForm tournamentId={t.id} />
        <DeleteDraftTournamentForm tournamentId={t.id} clubId={t.clubId} />
      </div>
    </div>
  );
}
