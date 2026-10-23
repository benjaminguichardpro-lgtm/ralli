import { z } from "zod";
import { clubNameSchema } from "@/lib/validation/account";

// Fiche du club : champs facultatifs saisis par les admins, et affichage. Fonctions pures.
// Un champ laissé vide efface la valeur (null en base). Les limites sont aussi des CHECK en base (migration club_profile).

const FOUNDED_YEAR_MIN = 1800;
export const LICENSEES_MAX = 10_000;
export const COURTS_MAX = 100;
export const ADDRESS_MAX = 200;
export const POSTAL_CODE_MAX = 20;
export const CITY_MAX = 100;
export const WEBSITE_MAX = 300;
export const DESCRIPTION_MAX = 500;

export const NOT_SPECIFIED = "Non précisé";

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Au plus ${max} caractères` })
    .transform((s) => (s === "" ? null : s));

const count = (label: string, max: number) =>
  z
    .string()
    .trim()
    .transform((s, ctx) => {
      if (s === "") return null;
      if (!/^\d{1,6}$/.test(s)) {
        ctx.addIssue({ code: "custom", message: `${label} : un nombre entier` });
        return z.NEVER;
      }
      const n = Number(s);
      if (n > max) {
        ctx.addIssue({ code: "custom", message: `${label} : au plus ${max}` });
        return z.NEVER;
      }
      return n;
    });

/** Adresse web : http:// ou https:// uniquement (jamais javascript:, data:, etc.). Vide = pas de site. */
export const websiteSchema = z
  .string()
  .trim()
  .max(WEBSITE_MAX, { error: `Au plus ${WEBSITE_MAX} caractères` })
  .transform((s, ctx) => {
    if (s === "") return null;
    let url: URL | null = null;
    try {
      url = /^https?:\/\//i.test(s) && !/\s/.test(s) ? new URL(s) : null;
    } catch {
      url = null;
    }
    if (!url || !url.hostname.includes(".") || url.username || url.password) {
      ctx.addIssue({ code: "custom", message: "L'adresse doit commencer par https:// ou http:// (exemple : https://www.monclub.fr)" });
      return z.NEVER;
    }
    return s;
  });

export function clubProfileSchema(currentYear: number) {
  return z.object({
    name: clubNameSchema,
    foundedYear: z
      .string()
      .trim()
      .transform((s, ctx) => {
        if (s === "") return null;
        const n = /^\d{4}$/.test(s) ? Number(s) : NaN;
        if (!(n >= FOUNDED_YEAR_MIN && n <= currentYear)) {
          ctx.addIssue({ code: "custom", message: `Année de fondation : entre ${FOUNDED_YEAR_MIN} et ${currentYear}` });
          return z.NEVER;
        }
        return n;
      }),
    licenseeCount: count("Licenciés", LICENSEES_MAX),
    address: text(ADDRESS_MAX),
    postalCode: text(POSTAL_CODE_MAX),
    city: text(CITY_MAX),
    websiteUrl: websiteSchema,
    description: text(DESCRIPTION_MAX),
    indoorCourts: count("Courts intérieurs", COURTS_MAX),
    outdoorCourts: count("Courts extérieurs", COURTS_MAX),
  });
}
export type ClubProfileInput = z.infer<ReturnType<typeof clubProfileSchema>>;

/** Les champs de la fiche, tels qu'ils sont lus en base. */
export type ClubProfileFields = Omit<ClubProfileInput, "name">;

/** Logo : mêmes formats que les photos de profil, mais jamais recadré (un blason doit rester entier). */
export const LOGO_SIZE_PX = 512;

/** Adresse de l'image du logo (la date change l'adresse, donc rafraîchit les caches), ou null s'il n'y en a pas. */
export function logoSrc(club: { id: string; logoUpdatedAt: Date | null }): string | null {
  return club.logoUpdatedAt ? `/api/club-logo/${club.id}?v=${club.logoUpdatedAt.getTime()}` : null;
}

const CONNECTORS = new Set(["de", "du", "des", "la", "le", "les", "d", "l", "et", "au", "aux"]);

/** Initiales de la pastille sans logo : « TC Démo-Lyon » → TC, « Tennis Club de Lyon » → TC, « Roland » → R. */
export function clubInitials(name: string): string {
  const words = name
    .normalize("NFC")
    .split(/[\s'’-]+/)
    .filter((w) => w !== "" && !CONNECTORS.has(w.toLocaleLowerCase("fr-FR")));
  const first = words[0];
  if (!first) return "?";
  if (/^\p{Lu}{2,}$/u.test(first)) return Array.from(first).slice(0, 3).join(""); // sigle déjà écrit en majuscules (TC, ASPTT → ASP)
  return words
    .slice(0, 2)
    .map((w) => Array.from(w)[0]!.toLocaleUpperCase("fr-FR"))
    .join("");
}

/** « 12 rue des Lilas, 69003 Lyon » avec ce qui est renseigné ; null si rien. */
export function formatAddress(p: { address: string | null; postalCode: string | null; city: string | null }): string | null {
  const town = [p.postalCode, p.city].filter(Boolean).join(" ");
  const parts = [p.address, town].filter((x) => x && x !== "");
  return parts.length > 0 ? parts.join(", ") : null;
}

/** Nombre avec un séparateur de milliers fin (« 1 250 »). */
export function formatCount(n: number): string {
  return new Intl.NumberFormat("fr-FR").format(n);
}

/** Nom du site pour l'affichage du lien : sans https:// ni « www. » ni barre finale. */
export function websiteLabel(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
}

/** Vrai tant qu'aucune information de la fiche n'est remplie et qu'il n'y a pas de logo (le nom, lui, existe toujours). */
export function isProfileEmpty(p: ClubProfileFields & { logoUpdatedAt: Date | null }): boolean {
  return (
    p.logoUpdatedAt === null &&
    p.foundedYear === null &&
    p.licenseeCount === null &&
    p.address === null &&
    p.postalCode === null &&
    p.city === null &&
    p.websiteUrl === null &&
    p.description === null &&
    p.indoorCourts === null &&
    p.outdoorCourts === null
  );
}
