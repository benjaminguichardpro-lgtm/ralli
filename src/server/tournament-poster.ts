import type { FftRank, MatchOutcome, Side, TournamentStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { fftLabel } from "@/lib/fft";
import { sideName } from "@/lib/matches";
import { type SetScore, formatSets } from "@/lib/scores/result";
import { formatParisTime } from "@/lib/time";
import { posterHeading, posterScore } from "@/lib/tournaments/poster";
import { DomainError } from "./errors";
import { getClubRole } from "./permissions";

// Affiche d'un tournoi (écran du club-house). Lecture seule : les matchs, joueurs, heures et scores sont ceux du tableau du tournoi
// (une seule saisie, par les admins et les juges-arbitres). Un tournoi publié est lisible de tous, comme sa page ; un brouillon du
// personnel seulement. Les joueurs s'affichent en « Prénom Nom » comme partout.

const NOT_FOUND = new DomainError("NOT_FOUND", "Tournoi introuvable");
const TO_BE_DECIDED = "À déterminer";

export type PosterPlayer = { name: string; club: string; rank: string; won: boolean };

export type PosterRow = {
  id: string;
  /** « 09:00 », vide si le match n'a pas encore d'heure. */
  time: string;
  table: string;
  home: PosterPlayer;
  away: PosterPlayer;
  score: string;
  winnerSide: Side | null;
  done: boolean;
};

export type PosterView = {
  id: string;
  name: string;
  clubId: string;
  clubName: string;
  /** Date du logo du club (null : pas de logo, pastille d'initiales). */
  logoUpdatedAt: Date | null;
  venue: string;
  status: TournamentStatus;
  startsAt: Date;
  heading: "Matchs du" | "Résultats du";
  tableLabel: string | null;
  rows: PosterRow[];
  /** Admin du club ou juge-arbitre : peut remplir l'affiche (depuis la page du tournoi). */
  isStaff: boolean;
};

const playerSel = { select: { firstName: true, lastName: true, fftRank: true, externalClubName: true } } as const;
type P = { firstName: string; lastName: string; fftRank: FftRank; externalClubName: string | null };

export async function getTournamentPoster(viewerId: string | null, tournamentId: string): Promise<PosterView> {
  const t = await db.tournament.findUnique({
    where: { id: tournamentId },
    select: {
      id: true, clubId: true, name: true, status: true, startsAt: true, tableLabel: true, venue: true,
      club: { select: { name: true, deletedAt: true, address: true, city: true, logoUpdatedAt: true } },
      referees: { select: { userId: true } },
      matches: {
        orderBy: [{ startsAt: { sort: "asc", nulls: "last" } }, { round: "asc" }, { position: "asc" }],
        select: { id: true, startsAt: true, outcome: true, winnerSide: true, sets: true, homePlayer: playerSel, awayPlayer: playerSel },
      },
    },
  });
  if (!t || t.club.deletedAt) throw NOT_FOUND;
  const role = viewerId ? await getClubRole(viewerId, t.clubId) : null;
  const isStaff = role === "ADMIN" || (role !== null && t.referees.some((r) => r.userId === viewerId));
  if ((t.status === "DRAFT" || t.status === "CANCELLED") && !isStaff) throw NOT_FOUND;

  const table = t.tableLabel ?? "";
  const player = (p: P | null, won: boolean): PosterPlayer =>
    p ? { name: sideName([p], viewerId === null), club: p.externalClubName ?? t.club.name, rank: fftLabel(p.fftRank), won } : { name: TO_BE_DECIDED, club: "", rank: "", won: false };

  // Un match figure sur l'affiche dès que ses deux joueurs sont connus ou qu'il a une heure.
  const rows: PosterRow[] = t.matches
    .filter((m) => (m.homePlayer && m.awayPlayer) || m.startsAt)
    .map((m) => ({
      id: m.id,
      time: m.startsAt ? formatParisTime(m.startsAt) : "",
      table,
      home: player(m.homePlayer, m.winnerSide === "HOME"),
      away: player(m.awayPlayer, m.winnerSide === "AWAY"),
      score: posterScore({ outcome: m.outcome as MatchOutcome | null, sets: formatSets((m.sets as SetScore[] | null) ?? []) }),
      winnerSide: m.winnerSide,
      done: m.outcome !== null,
    }));

  return {
    id: t.id,
    name: t.name,
    clubId: t.clubId,
    clubName: t.club.name,
    logoUpdatedAt: t.club.logoUpdatedAt,
    venue: t.venue ?? ([t.club.address, t.club.city].filter(Boolean).join(", ") || t.club.name),
    status: t.status,
    startsAt: t.startsAt,
    heading: posterHeading(rows),
    tableLabel: t.tableLabel,
    rows,
    isStaff,
  };
}
