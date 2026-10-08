// Heures de rencontre : saisies et affichées en heure de Paris, stockées en UTC.

export const APP_TIME_ZONE = "Europe/Paris";

const partsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Composantes de l'heure de Paris pour un instant donné. */
function parisParts(d: Date) {
  const p = Object.fromEntries(partsFormatter.formatToParts(d).map((x) => [x.type, x.value]));
  return { y: +p.year!, mo: +p.month!, d: +p.day!, h: +p.hour!, mi: +p.minute! };
}

export class InvalidLocalTimeError extends Error {}

/**
 * « 2026-10-12T14:30 » (valeur d'un <input type="datetime-local">), lu en heure de Paris → instant UTC.
 * Heure inexistante (saut d'été, 2 h → 3 h) : erreur. Heure ambiguë (retour à l'heure d'hiver) : première occurrence.
 */
export function parseParisLocal(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) throw new InvalidLocalTimeError("Date et heure invalides");
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  // Deux candidats possibles selon le décalage (été / hiver) ; on garde ceux qui retombent sur la saisie.
  const candidates = [120, 60]
    .map((off) => new Date(naive - off * 60_000))
    .filter((c) => {
      const p = parisParts(c);
      return p.y === y && p.mo === mo && p.d === d && p.h === h && p.mi === mi;
    });
  if (candidates.length === 0) throw new InvalidLocalTimeError("Cette heure n'existe pas (passage à l'heure d'été)");
  return candidates[0]!;
}

/** Instant → valeur pour <input type="datetime-local">, en heure de Paris. */
export function toParisLocalInput(date: Date): string {
  const p = parisParts(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`;
}

const displayFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: APP_TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** « lundi 12 octobre 2026 à 14:30 » (heure de Paris). */
export function formatParis(date: Date): string {
  return displayFormatter.format(date);
}


/** Semaine ISO de l'instant, lue en heure de Paris : « 2026-W41 » (clé d'idempotence du bonus du lundi). */
export function isoWeekKey(date: Date): string {
  const p = parisParts(date);
  const day = new Date(Date.UTC(p.y, p.mo - 1, p.d));
  // Le jeudi de la semaine détermine l'année ISO.
  const dow = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - dow);
  const year = day.getUTCFullYear();
  const week = Math.ceil(((day.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/**
 * Semaine en cours, du lundi 00:00 (inclus) au lundi suivant 00:00 (exclu), heure de Paris.
 * Minuit existe toujours à Paris (le changement d'heure a lieu à 2 h ou 3 h du matin).
 */
export function parisWeekBounds(now: Date): { start: Date; end: Date } {
  const p = parisParts(now);
  const day = new Date(Date.UTC(p.y, p.mo - 1, p.d));
  const dow = day.getUTCDay() || 7; // lundi = 1 … dimanche = 7
  const at = (offsetDays: number) => {
    const d = new Date(day.getTime() + offsetDays * 86_400_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return parseParisLocal(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T00:00`);
  };
  return { start: at(1 - dow), end: at(8 - dow) };
}

const timeFormatter = new Intl.DateTimeFormat("fr-FR", { timeZone: APP_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dayFormatter = new Intl.DateTimeFormat("fr-FR", { timeZone: APP_TIME_ZONE, weekday: "long", day: "numeric", month: "long" });

/** « 14:00 » (heure de Paris). */
export function formatParisTime(date: Date): string {
  return timeFormatter.format(date);
}

/** « dimanche 14 mars » (jour de Paris). */
export function formatParisDay(date: Date): string {
  return dayFormatter.format(date);
}

/**
 * Repère simple pour situer une date, sans compte à rebours : « aujourd'hui », « demain », « dans 3 jours »
 * (jusqu'à 6 jours), sinon null. Comparaison par jour calendaire de Paris, pas par durée de 24 h.
 */
export function relativeDayLabel(date: Date, now: Date): string | null {
  const a = parisParts(date);
  const b = parisParts(now);
  const days = Math.round((Date.UTC(a.y, a.mo - 1, a.d) - Date.UTC(b.y, b.mo - 1, b.d)) / 86_400_000);
  if (days === 0) return "aujourd'hui";
  if (days === 1) return "demain";
  if (days >= 2 && days <= 6) return `dans ${days} jours`;
  return null;
}

/** Jour calendaire de Paris sous la forme « 2026-10-12 » (clé d'idempotence du bonus de connexion). */
export function parisDateKey(date: Date): string {
  const p = parisParts(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}`;
}
