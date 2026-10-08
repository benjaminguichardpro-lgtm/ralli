import type { RankedRow } from "@/lib/leaderboard/rank";

export const signedAces = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("fr-FR")} Aces`;

/** Tableau de classement. La ligne du lecteur est mise en évidence par un fond et la mention « (vous) », pas seulement par la couleur. */
export function LeaderboardTable({ rows, viewerId, compact = false }: { rows: RankedRow[]; viewerId: string; compact?: boolean }) {
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
          <tr key={r.userId} data-testid="leaderboard-row" className={r.userId === viewerId ? "bg-canvas font-semibold" : ""}>
            <td className="py-2 pr-2">{r.rank}</td>
            <td className="py-2 pr-2">
              {r.displayName}
              {r.userId === viewerId && <span className="ml-1 font-normal text-ink-muted">(vous)</span>}
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
