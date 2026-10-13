import { clubSize, isClubSize } from "./size";
import { isRegion } from "./region";

/** Texte sans accents ni majuscules, pour comparer « Évian », « evian » et « ÉVIAN ». */
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/\s+/g, " ")
    .trim();
}

/** Un club correspond à la recherche si chaque mot saisi se retrouve dans son nom, sa ville ou son code postal. */
export function clubMatchesQuery(club: { name: string; city: string | null; postalCode: string | null }, query: string): boolean {
  const words = normalizeSearch(query).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalizeSearch([club.name, club.city ?? "", club.postalCode ?? ""].join(" "));
  return words.every((w) => haystack.includes(w));
}

export type ClubFilters = {
  region: string | null;
  size: "small" | "medium" | "large" | null;
  upcomingOnly: boolean;
};

/** Lit les filtres de l'adresse (`?region=&taille=&avenir=1`). Une valeur inconnue est ignorée. */
export function parseClubFilters(params: { region?: string | string[]; taille?: string | string[]; avenir?: string | string[] }): ClubFilters {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const region = one(params.region);
  const size = one(params.taille);
  return {
    region: isRegion(region) ? region : null,
    size: isClubSize(size) ? size : null,
    upcomingOnly: one(params.avenir) === "1",
  };
}

/** Vrai si le club passe tous les filtres actifs. Un club sans région (ou sans licenciés) ne passe pas un filtre qui la demande. */
export function clubMatchesFilters(club: { region: string | null; licenseeCount: number | null; hasUpcoming: boolean }, f: ClubFilters): boolean {
  if (f.region && club.region !== f.region) return false;
  if (f.size && clubSize(club.licenseeCount) !== f.size) return false;
  if (f.upcomingOnly && !club.hasUpcoming) return false;
  return true;
}

/** Adresse d'une page de l'annuaire en gardant la recherche et les filtres (`?q=&region=&taille=&avenir=1`). */
export function directoryHref(base: string, q: string, f: ClubFilters): string {
  const sp = new URLSearchParams();
  if (q.trim()) sp.set("q", q.trim());
  if (f.region) sp.set("region", f.region);
  if (f.size) sp.set("taille", f.size);
  if (f.upcomingOnly) sp.set("avenir", "1");
  const qs = sp.toString();
  return qs ? `${base}?${qs}` : base;
}
