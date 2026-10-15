// Date de naissance d'un joueur (facultative, visible des admins seulement) et âge calculé. Fonctions pures.

export const BIRTH_MIN_YEAR = 1900;

/** Date réelle ? (« 31/02/1990 » → faux) */
function validDate(y: number, m: number, d: number): boolean {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * Lit une date de naissance saisie : « 14/03/1987 », « 14-03-1987 », « 14.03.1987 », « 1987-03-14 », ou un objet Date (cellule Excel).
 * Une année seule (« 1987 ») donne le 1er janvier de cette année. Renvoie null si vide ; une erreur de domaine (message) si invalide ou dans le futur.
 */
export function parseBirthDate(raw: unknown, now = new Date()): { date: Date | null; yearOnly: boolean } | { error: string } {
  if (raw === null || raw === undefined) return { date: null, yearOnly: false };
  let y: number, m: number, d: number;
  let yearOnly = false;
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return { error: "Date de naissance invalide" };
    // Une cellule Excel est lue à minuit UTC : on garde le jour tel qu'écrit.
    y = raw.getUTCFullYear();
    m = raw.getUTCMonth() + 1;
    d = raw.getUTCDate();
  } else {
    const s = String(raw).trim();
    if (s === "") return { date: null, yearOnly: false };
    let r = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(s);
    if (r) [d, m, y] = [Number(r[1]), Number(r[2]), Number(r[3])] as [number, number, number];
    else if ((r = /^(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})$/.exec(s))) [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])] as [number, number, number];
    else if ((r = /^(\d{4})$/.exec(s))) {
      [y, m, d] = [Number(r[1]), 1, 1];
      yearOnly = true;
    } else return { error: "Date de naissance : jj/mm/aaaa" };
  }
  if (!validDate(y, m, d)) return { error: "Date de naissance inexistante" };
  const date = new Date(Date.UTC(y, m - 1, d));
  if (y < BIRTH_MIN_YEAR || date.getTime() > now.getTime()) return { error: "Date de naissance hors limites" };
  return { date, yearOnly };
}

/** Âge en années révolues à la date `now` (jour de naissance pris en UTC, comme la date stockée). */
export function ageFrom(birth: Date, now = new Date()): number {
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const before = now.getUTCMonth() < birth.getUTCMonth() || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate());
  if (before) age--;
  return age;
}

/** « 14/03/1987 » pour l'affichage et le champ de saisie. */
export function formatBirth(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(date.getUTCDate())}/${p(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}
