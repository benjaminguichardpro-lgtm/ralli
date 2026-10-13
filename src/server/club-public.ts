import { db } from "@/lib/db";
import { freeSlug, slugSchema, slugify } from "@/lib/clubs/slug";
import { DomainError, isUniqueViolation } from "./errors";
import { requireClubAdmin } from "./permissions";
import { listPublicClubEncounters } from "./encounters";
import { RESULTS_PAGE_SIZE } from "./results-feed";
import { readPhoto } from "./avatar-storage";

// Page publique d'un club (/c/<slug>) : visible sans compte, seulement quand un admin l'a activée. Désactivée par défaut.
// Contenu : fiche (sans la description libre), équipes du club, rencontres à venir et résultats. Aucune donnée de membre.

export type PublicClub = {
  id: string;
  name: string;
  slug: string;
  logoUpdatedAt: Date | null;
  foundedYear: number | null;
  licenseeCount: number | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  websiteUrl: string | null;
  indoorCourts: number | null;
  outdoorCourts: number | null;
  teams: { id: string; name: string }[];
};

/** Le club de cette adresse, ou null s'il n'existe pas OU si sa page n'est pas publique (même réponse : on ne révèle rien). */
export async function getPublicClub(slug: string): Promise<PublicClub | null> {
  const club = await db.club.findFirst({
    where: { slug, publicPage: true },
    select: {
      id: true,
      name: true,
      slug: true,
      logoUpdatedAt: true,
      foundedYear: true,
      licenseeCount: true,
      address: true,
      postalCode: true,
      city: true,
      websiteUrl: true,
      indoorCourts: true,
      outdoorCourts: true,
      teams: { where: { kind: "CLUB" }, orderBy: { name: "asc" }, select: { id: true, name: true } },
    },
  });
  return club ? ({ ...club, slug: club.slug! } as PublicClub) : null;
}

/** Rencontres à venir et résultats (provisoires compris) du club public. Jamais de brouillon ni d'archive. */
export async function getPublicClubEncounters(clubId: string) {
  const { upcoming, recent } = await listPublicClubEncounters(clubId);
  return { upcoming, recent: recent.slice(0, RESULTS_PAGE_SIZE) };
}

/** Logo d'un club dont la page est publique (route /api/club-logo, sans compte). */
export async function getPublicClubLogo(clubId: string): Promise<Buffer | null> {
  const club = await db.club.findFirst({ where: { id: clubId, publicPage: true, logoUpdatedAt: { not: null } }, select: { id: true } });
  return club ? readPhoto(clubId, "club-logo") : null;
}

export type PublicPageSettings = { publicPage: boolean; slug: string | null };

export async function getPublicPageSettings(actorId: string, clubId: string): Promise<PublicPageSettings> {
  await requireClubAdmin(actorId, clubId);
  const club = await db.club.findUnique({ where: { id: clubId }, select: { publicPage: true, slug: true } });
  if (!club) throw new DomainError("NOT_FOUND", "Club introuvable");
  return club;
}

/**
 * Active ou désactive la page publique (admins). À la première activation l'adresse est créée à partir du nom du club ;
 * `slug` (facultatif) la remplace. Désactiver garde l'adresse (réservée au club) mais la page répond « introuvable ».
 */
export async function setPublicPage(actorId: string, clubId: string, enabled: boolean, slug?: string): Promise<PublicPageSettings> {
  await requireClubAdmin(actorId, clubId);
  const club = await db.club.findUnique({ where: { id: clubId }, select: { name: true, slug: true } });
  if (!club) throw new DomainError("NOT_FOUND", "Club introuvable");
  let next = club.slug;
  if (slug !== undefined && slug !== club.slug) {
    const parsed = slugSchema.safeParse(slug);
    if (!parsed.success) throw new DomainError("INVALID", parsed.error.issues[0]!.message);
    const other = await db.club.findFirst({ where: { slug: parsed.data, NOT: { id: clubId } }, select: { id: true } });
    if (other) throw new DomainError("INVALID", "Cette adresse est déjà prise par un autre club");
    next = parsed.data;
  }
  if (enabled && !next) next = await freeSlug(slugify(club.name), async (s) => (await db.club.count({ where: { slug: s } })) > 0);
  try {
    return await db.club.update({ where: { id: clubId }, data: { publicPage: enabled, slug: next }, select: { publicPage: true, slug: true } });
  } catch (e) {
    // Deux admins qui prennent la même adresse en même temps : la contrainte d'unicité tranche.
    if (isUniqueViolation(e)) throw new DomainError("INVALID", "Cette adresse est déjà prise par un autre club");
    throw e;
  }
}
