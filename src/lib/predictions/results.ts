// Onglet « Résultats » : rallis terminés de l'utilisateur, résumé et filtres. Fonctions pures.
// Un « ralli » est le pronostic validé par l'utilisateur. Définition du bénéfice identique à celle du classement :
// Aces gagnés − Aces engagés, sur les rallis gagnés ou perdus ; les remboursés ne comptent pas.

export type ResultStatus = "WON" | "LOST" | "REFUNDED";

export const RESULT_FILTERS = [
  { key: "tous", label: "Tous", status: null },
  { key: "gagnes", label: "Gagnés", status: "WON" },
  { key: "perdus", label: "Perdus", status: "LOST" },
  { key: "rembourses", label: "Remboursés", status: "REFUNDED" },
] as const;

export type ResultFilterKey = (typeof RESULT_FILTERS)[number]["key"];

/** Valeur du paramètre d'adresse `?statut=` : toute valeur inconnue revient à « Tous ». */
export function parseResultFilter(raw: string | string[] | undefined): ResultFilterKey {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return RESULT_FILTERS.find((f) => f.key === v)?.key ?? "tous";
}

export const PAGE_SIZE = 20;
export const LIMIT_MAX = 200;

/** Nombre de rallis affichés (`?limite=`) : par paliers de 20, jamais moins de 20 ni plus de 200. */
export function parseLimit(raw: string | string[] | undefined): number {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const n = v && /^\d{1,4}$/.test(v) ? Number(v) : PAGE_SIZE;
  return Math.min(LIMIT_MAX, Math.max(PAGE_SIZE, Math.ceil(n / PAGE_SIZE) * PAGE_SIZE));
}

/** Cumuls par résultat, tels que la base les donne. */
export type StatusTotals = {
  won: { count: number; committed: number; payout: number };
  lost: { count: number; committed: number };
  refunded: { count: number };
};

export type ResultsSummary = {
  /** Rallis terminés : gagnés + perdus (les remboursés n'ont pas été joués). */
  finished: number;
  won: number;
  lost: number;
  refunded: number;
  /** Pourcentage de rallis justes (entier), null tant qu'il n'y a ni gagné ni perdu. */
  hitRate: number | null;
  committedAces: number;
  wonAces: number;
  netAces: number;
};

export function summarize(t: StatusTotals): ResultsSummary {
  const finished = t.won.count + t.lost.count;
  const committedAces = t.won.committed + t.lost.committed;
  return {
    finished,
    won: t.won.count,
    lost: t.lost.count,
    refunded: t.refunded.count,
    hitRate: finished === 0 ? null : Math.round((t.won.count / finished) * 100),
    committedAces,
    wonAces: t.won.payout,
    netAces: t.won.payout - committedAces,
  };
}

export function filterCounts(t: StatusTotals): Record<ResultFilterKey, number> {
  return { tous: t.won.count + t.lost.count + t.refunded.count, gagnes: t.won.count, perdus: t.lost.count, rembourses: t.refunded.count };
}

/** Phrase de bilan : « 3 rallis justes sur 5 », « Aucun ralli terminé pour l'instant ». */
export function hitsSentence(s: ResultsSummary): string {
  if (s.finished === 0) return "Aucun ralli terminé pour l'instant";
  return `${s.won} ralli${s.won > 1 ? "s" : ""} juste${s.won > 1 ? "s" : ""} sur ${s.finished}`;
}

/** Ce qu'affiche une ligne : « Gagné +178 Aces », « Perdu −100 Aces », « Remboursé ». */
export function resultLine(r: { status: ResultStatus; committedAces: number; payoutAces: number | null }): { label: string; delta: string | null; tone: "won" | "lost" | "neutral" } {
  if (r.status === "WON") {
    const net = (r.payoutAces ?? 0) - r.committedAces;
    return { label: "Gagné", delta: formatDelta(net), tone: "won" };
  }
  if (r.status === "LOST") return { label: "Perdu", delta: formatDelta(-r.committedAces), tone: "lost" };
  return { label: "Remboursé", delta: null, tone: "neutral" };
}

/** « +178 Aces » / « −100 Aces » (vrai signe moins), séparateur de milliers fin. */
export function formatDelta(n: number): string {
  const abs = Math.abs(n).toLocaleString("fr-FR");
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${abs} Aces`;
}

/** Regroupe des lignes déjà triées (la plus récente d'abord) par rencontre, en gardant l'ordre de première apparition. */
export function groupByEncounter<T extends { encounterId: string }>(items: readonly T[]): { encounterId: string; items: T[] }[] {
  const groups = new Map<string, { encounterId: string; items: T[] }>();
  for (const it of items) {
    const g = groups.get(it.encounterId) ?? { encounterId: it.encounterId, items: [] };
    g.items.push(it);
    groups.set(it.encounterId, g);
  }
  return [...groups.values()];
}
