import sharp from "sharp";
import { PHOTO_FORMATS, PHOTO_MAX_BYTES } from "@/lib/avatars";
import { geocodeAddress, type Position } from "@/lib/clubs/geocode";
import { type ClubProfileFields, type ClubProfileInput, LOGO_SIZE_PX } from "@/lib/clubs/profile";
import { regionFromPostalCode } from "@/lib/clubs/region";
import { db } from "@/lib/db";
import { deletePhoto, readPhoto, savePhoto } from "./avatar-storage";
import { DomainError } from "./errors";
import { CLUB_NOT_FOUND, getClubRole, requireClubAdmin } from "./permissions";
import type { ClubRole } from "@/generated/prisma/client";

// Fiche du club. Lecture : tout compte connecté (les clubs sont publics dans Ralli). Écriture (fiche, nom, logo) : admins du club.
// Les droits sont relus en base à chaque appel : l'interface peut masquer un bouton, la garantie est ici.

export type ClubProfile = ClubProfileFields & {
  id: string;
  name: string;
  createdAt: Date;
  logoUpdatedAt: Date | null;
  /** Rôle du lecteur dans le club ; null s'il n'est pas membre (il consulte seulement). */
  myRole: ClubRole | null;
};

export async function getClubProfile(actorId: string, clubId: string): Promise<ClubProfile> {
  const myRole = await getClubRole(actorId, clubId);
  const club = await db.club.findFirst({
    where: { id: clubId, deletedAt: null },
    select: {
      id: true,
      name: true,
      createdAt: true,
      logoUpdatedAt: true,
      foundedYear: true,
      licenseeCount: true,
      address: true,
      postalCode: true,
      city: true,
      websiteUrl: true,
      description: true,
      indoorCourts: true,
      outdoorCourts: true,
    },
  });
  if (!club) throw CLUB_NOT_FOUND;
  return { ...club, myRole };
}

export type LocateAddress = (a: { address: string | null; postalCode: string | null; city: string | null }) => Promise<Position | null>;

/**
 * Enregistre le nom et la fiche (admins). Un champ vide efface la valeur. Calcule aussi la région (code postal) et, quand
 * l'adresse, le code postal ou la ville change (ou que le club n'était pas encore localisé), la position sur la carte.
 * L'enregistrement n'échoue jamais à cause de la carte. Renvoie `located` : true (épingle posée), false (adresse non
 * trouvée ou service indisponible), null (la fiche n'a pas d'adresse, rien à localiser).
 */
export async function updateClubProfile(actorId: string, clubId: string, input: ClubProfileInput, locate: LocateAddress = geocodeAddress): Promise<{ located: boolean | null }> {
  await requireClubAdmin(actorId, clubId);
  const before = await db.club.findUnique({ where: { id: clubId }, select: { address: true, postalCode: true, city: true, latitude: true } });
  if (!before) throw CLUB_NOT_FOUND;
  const region = regionFromPostalCode(input.postalCode);
  const hasAddress = Boolean(input.address || input.postalCode || input.city);
  const addressChanged = before.address !== input.address || before.postalCode !== input.postalCode || before.city !== input.city;
  let position: Position | null | undefined; // undefined : on garde la position actuelle
  if (!hasAddress) position = null;
  else if (addressChanged || before.latitude === null) position = await locate({ address: input.address, postalCode: input.postalCode, city: input.city });
  await db.club.update({
    where: { id: clubId },
    data: { ...input, region, ...(position === undefined ? {} : { latitude: position?.latitude ?? null, longitude: position?.longitude ?? null }) },
  });
  if (!hasAddress) return { located: null };
  if (position === undefined) return { located: true };
  return { located: position !== null };
}

/**
 * Importe le logo (admins) : JPG, PNG ou WebP, 5 Mo au maximum. Contrairement à une photo de profil il n'est PAS recadré :
 * il est seulement ramené à 512 px de côté au plus, en WebP. Le contenu est relu par sharp (le type annoncé ne compte pas).
 */
export async function uploadClubLogo(actorId: string, clubId: string, input: Buffer): Promise<void> {
  await requireClubAdmin(actorId, clubId);
  if (input.length === 0) throw new DomainError("INVALID", "Choisis une image");
  if (input.length > PHOTO_MAX_BYTES) throw new DomainError("INVALID", "Image trop lourde (5 Mo au maximum)");
  let out: Buffer;
  try {
    const image = sharp(input, { limitInputPixels: 50_000_000 });
    const { format } = await image.metadata();
    if (!format || !(PHOTO_FORMATS as readonly string[]).includes(format)) {
      throw new DomainError("INVALID", "Format non pris en charge : utilise une image JPG, PNG ou WebP");
    }
    out = await image
      .rotate()
      .resize(LOGO_SIZE_PX, LOGO_SIZE_PX, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
  } catch (e) {
    if (e instanceof DomainError) throw e;
    throw new DomainError("INVALID", "Cette image est illisible : essaie-en une autre");
  }
  await savePhoto(clubId, out, "club-logo");
  await db.club.update({ where: { id: clubId }, data: { logoUpdatedAt: new Date() } });
}

/** Retire le logo (admins) : la pastille avec les initiales revient. */
export async function removeClubLogo(actorId: string, clubId: string): Promise<void> {
  await requireClubAdmin(actorId, clubId);
  await db.club.update({ where: { id: clubId }, data: { logoUpdatedAt: null } });
  await deletePhoto(clubId, "club-logo");
}

/** Logo d'un club, pour tout compte connecté (les clubs sont publics : recherche, page du club). Sans logo : null. */
export async function getClubLogoFor(_viewerId: string, clubId: string): Promise<Buffer | null> {
  const club = await db.club.findFirst({ where: { id: clubId, deletedAt: null }, select: { logoUpdatedAt: true } });
  if (!club?.logoUpdatedAt) return null;
  return readPhoto(clubId, "club-logo");
}
