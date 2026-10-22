import { db } from "@/lib/db";
import { sideName } from "@/lib/matches";
import { sideLabel } from "./encounters";

type Person = { firstName: string; lastName: string };
const player = { select: { firstName: true, lastName: true } } as const;
const team = { select: { name: true, kind: true, externalClubName: true, club: { select: { name: true } } } } as const;

export type RallisSuggestion = { label: string; detail: string };

/**
 * Matchs proposés pendant la saisie dans « Mes rallis » : « Prénom Nom contre Prénom Nom » avec la rencontre ou le tournoi en dessous,
 * pour les 200 derniers rallis de l'utilisateur (en cours et terminés), du plus récent au plus ancien, sans doublon.
 */
export async function getRallisSuggestions(userId: string): Promise<RallisSuggestion[]> {
  const rows = await db.prediction.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      tournamentMatch: { select: { homePlayer: player, awayPlayer: player, tournament: { select: { name: true } } } },
      match: {
        select: {
          homePlayer: player,
          awayPlayer: player,
          homePlayer2: player,
          awayPlayer2: player,
          encounter: { select: { homeTeam: team, awayTeam: team } },
        },
      },
    },
  });
  const out = new Map<string, RallisSuggestion>();
  const add = (label: string, detail: string) => out.set(`${label}|${detail}`, { label, detail });
  for (const r of rows) {
    const tm = r.tournamentMatch;
    if (tm?.homePlayer && tm.awayPlayer) add(`${sideName([tm.homePlayer])} contre ${sideName([tm.awayPlayer])}`, tm.tournament.name);
    const m = r.match;
    if (m) {
      const side = (a: Person, b: Person | null) => sideName(b ? [a, b] : [a]);
      add(`${side(m.homePlayer, m.homePlayer2)} contre ${side(m.awayPlayer, m.awayPlayer2)}`, `${sideLabel(m.encounter.homeTeam)} – ${sideLabel(m.encounter.awayTeam)}`);
    }
  }
  return [...out.values()];
}
