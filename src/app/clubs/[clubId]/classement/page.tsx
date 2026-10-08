import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LeaderboardTable } from "@/components/leaderboard";
import { LEADERBOARD_SIZE } from "@/config/season";
import { requireUser } from "@/lib/auth/current-user";
import { DomainError } from "@/server/errors";
import { type LeaderboardView, type Period, getLeaderboard } from "@/server/leaderboard";

export const metadata: Metadata = { title: "Classement · Ralli" };

type Props = { params: Promise<{ clubId: string }>; searchParams: Promise<{ periode?: string | string[] }> };

export default function LeaderboardPage(props: Props) {
  return (
    <Suspense fallback={<p className="text-ink-muted">Chargement…</p>}>
      <Leaderboard {...props} />
    </Suspense>
  );
}

async function Leaderboard({ params, searchParams }: Props) {
  const user = await requireUser();
  const { clubId } = await params;
  const { periode } = await searchParams;
  const period: Period = periode === "semaine" ? "week" : "season";
  let board: LeaderboardView;
  try {
    board = await getLeaderboard(user.id, clubId, period);
  } catch (e) {
    // Non-membre ou club inexistant : même réponse.
    if (e instanceof DomainError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const tab = (active: boolean) =>
    `inline-flex min-h-11 items-center rounded-lg px-4 font-semibold ${active ? "bg-primary text-on-primary" : "border border-primary bg-surface text-primary"}`;
  const rows = board.me ? [...board.top, board.me] : board.top;

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-serif text-3xl text-primary">Classement</h1>
        <p className="text-ink-muted">Bénéfice net = Aces gagnés − Aces engagés, sur les pronostics terminés de ce club.</p>
      </div>

      <nav aria-label="Période" className="flex flex-wrap gap-2">
        <Link href={`/clubs/${clubId}/classement`} className={tab(period === "season")} aria-current={period === "season" ? "page" : undefined}>
          Saison
        </Link>
        <Link href={`/clubs/${clubId}/classement?periode=semaine`} className={tab(period === "week")} aria-current={period === "week" ? "page" : undefined}>
          Cette semaine
        </Link>
      </nav>

      <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
        {board.total === 0 ? (
          <p className="text-ink-muted" data-testid="leaderboard-empty">
            Personne n&apos;est encore classé{period === "season" ? " sur la saison" : " cette semaine"}.
          </p>
        ) : (
          <>
            <LeaderboardTable rows={rows} viewerId={user.id} />
            {board.me && <p className="text-sm text-ink-muted">Vous êtes {board.me.rank}e sur {board.total}. Les {LEADERBOARD_SIZE} premiers sont affichés.</p>}
          </>
        )}
        {!board.top.some((r) => r.userId === user.id) && !board.me && (
          <p className="text-sm text-ink-muted" data-testid="my-progress">
            {board.mySettled === 0
              ? `Il faut ${board.minSettled} pronostic${board.minSettled > 1 ? "s" : ""} terminé${board.minSettled > 1 ? "s" : ""} dans ce club pour apparaître.`
              : `Vous avez ${board.mySettled} pronostic${board.mySettled > 1 ? "s" : ""} terminé${board.mySettled > 1 ? "s" : ""} : il en faut ${board.minSettled} pour apparaître.`}
          </p>
        )}
      </div>

      <Link href={`/clubs/${clubId}`} className="inline-flex min-h-11 items-center font-semibold text-primary underline">
        Retour au club
      </Link>
    </section>
  );
}
