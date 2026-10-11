import { DEFAULT_AVATAR_KEY } from "@/lib/avatars";
import { type RankMove, type RankedRow, rankMoveSentence, rankMoveShort } from "@/lib/leaderboard/rank";
import { Avatar } from "./avatar";

export const signedAces = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("fr-FR")} Aces`;

const MOVE_TONE = { up: "text-primary", down: "text-ink", same: "text-ink-muted", new: "text-ink-muted" } as const;

/** Mouvement de place depuis lundi : « ▲2 », « ▼1 », « = », « Nouveau » (la phrase complète est lue par les lecteurs d'écran). */
export function RankMoveBadge({ move }: { move: RankMove }) {
  return (
    <span className={`ml-1.5 text-xs font-semibold ${MOVE_TONE[move.kind]}`} data-testid="rank-move" data-move={move.kind}>
      <span aria-hidden="true">{rankMoveShort(move)}</span>
      <span className="sr-only">{rankMoveSentence(move)}</span>
    </span>
  );
}

/** Tableau de classement. La ligne du lecteur est mise en évidence par un fond et la mention « (vous) », pas seulement par la couleur. */
export function LeaderboardTable({ rows, viewerId, compact = false, viewerMove = null }: { rows: RankedRow[]; viewerId: string; compact?: boolean; viewerMove?: RankMove | null }) {
  return (
    <table className="w-full text-left text-sm" data-testid="leaderboard">
      <caption className="sr-only">Classement</caption>
      <thead>
        <tr className="text-ink-muted">
          <th scope="col" className="py-1 pr-2 font-medium">Rang</th>
          <th scope="col" className="py-1 pr-2 font-medium">Pseudo</th>
          <th scope="col" className="py-1 pr-2 text-right font-medium">Bénéfice net</th>
          {!compact && (
            <>
              <th scope="col" className="py-1 pr-2 text-right font-medium">Pronostics</th>
              <th scope="col" className="py-1 text-right font-medium">Réussite</th>
            </>
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.userId} data-testid="leaderboard-row" className={r.userId === viewerId ? "bg-pale font-semibold" : ""}>
            <td className="py-2 pr-2 whitespace-nowrap">
              {r.rank}
              {r.userId === viewerId && viewerMove && <RankMoveBadge move={viewerMove} />}
            </td>
            <td className="py-2 pr-2">
              <span className="flex items-center gap-2">
                <Avatar user={{ id: r.userId, avatarKey: r.avatarKey ?? DEFAULT_AVATAR_KEY, avatarPhotoAt: r.avatarPhotoAt ?? null }} size={32} />
                <span>
                  {r.displayName}
                  {r.userId === viewerId && <span className="ml-1 font-normal text-ink-muted">(vous)</span>}
                </span>
              </span>
            </td>
            <td className="py-2 pr-2 text-right">{signedAces(r.net)}</td>
            {!compact && (
              <>
                <td className="py-2 pr-2 text-right">{r.settled}</td>
                <td className="py-2 text-right">{r.successRate} %</td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
