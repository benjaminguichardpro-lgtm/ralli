import { z } from "zod";

// Adresse lisible de la page publique d'un club : /c/tc-lyon. Fonctions pures. Les limites sont aussi un CHECK en base.

export const SLUG_MIN = 3;
export const SLUG_MAX = 50;

/** Mots qui ne doivent pas servir d'adresse de club (réservés à l'appli). */
const RESERVED = new Set(["admin", "api", "ralli", "connexion", "inscription", "clubs", "club", "nouveau"]);

/** « TC Démo-Lyon » → « tc-demo-lyon » : sans accents, minuscules, tirets, 50 caractères au plus. */
export function slugify(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
  return base.length >= SLUG_MIN ? base : `club-${base}`.replace(/-+$/g, "");
}

/** Premier slug libre : « tc-lyon », puis « tc-lyon-2 », « tc-lyon-3 »… `taken` dit si une adresse est déjà prise. */
export async function freeSlug(wanted: string, taken: (slug: string) => Promise<boolean>): Promise<string> {
  for (let n = 1; n < 100; n++) {
    const suffix = n === 1 ? "" : `-${n}`;
    const candidate = `${wanted.slice(0, SLUG_MAX - suffix.length).replace(/-+$/g, "")}${suffix}`;
    if (!RESERVED.has(candidate) && !(await taken(candidate))) return candidate;
  }
  throw new Error("Aucune adresse libre");
}

export const slugSchema = z
  .string({ error: "Adresse requise" })
  .trim()
  .toLowerCase()
  .min(SLUG_MIN, { error: `Au moins ${SLUG_MIN} caractères` })
  .max(SLUG_MAX, { error: `Au plus ${SLUG_MAX} caractères` })
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, { error: "Lettres minuscules, chiffres et tirets seulement" })
  .refine((s) => !RESERVED.has(s), { error: "Cette adresse est réservée" });

export const publicPath = (slug: string) => `/c/${slug}`;
