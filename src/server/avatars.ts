import sharp from "sharp";
import { AVATARS, PHOTO_FORMATS, PHOTO_MAX_BYTES, PHOTO_SIZE_PX, isAvatarKey } from "@/lib/avatars";
import { db } from "@/lib/db";
import { deletePhoto, readPhoto, savePhoto } from "./avatar-storage";
import { DomainError } from "./errors";
import { getClubRole } from "./permissions";

/** Choisit un avatar prédéfini. Une photo importée est retirée : l'un ou l'autre, jamais les deux. */
export async function setPresetAvatar(userId: string, key: string): Promise<void> {
  if (!isAvatarKey(key)) throw new DomainError("INVALID", "Avatar inconnu");
  await db.user.update({ where: { id: userId }, data: { avatarKey: key, avatarPhotoAt: null } });
  await deletePhoto(userId);
}

/**
 * Importe une photo : formats JPEG, PNG ou WebP, 5 Mo au maximum. Elle est recadrée au centre en carré,
 * ramenée à 256 px et enregistrée en WebP. Le contenu est relu par sharp : l'extension ou le type annoncé ne comptent pas.
 */
export async function uploadAvatarPhoto(userId: string, input: Buffer): Promise<void> {
  if (input.length === 0) throw new DomainError("INVALID", "Choisissez une photo");
  if (input.length > PHOTO_MAX_BYTES) throw new DomainError("INVALID", "Photo trop lourde (5 Mo au maximum)");
  let out: Buffer;
  try {
    const image = sharp(input, { limitInputPixels: 50_000_000 });
    const { format } = await image.metadata();
    if (!format || !(PHOTO_FORMATS as readonly string[]).includes(format)) {
      throw new DomainError("INVALID", "Format non pris en charge : utilisez une photo JPG, PNG ou WebP");
    }
    out = await image
      .rotate() // respecte l'orientation des photos de téléphone
      .resize(PHOTO_SIZE_PX, PHOTO_SIZE_PX, { fit: "cover", position: "centre" })
      .webp({ quality: 82 })
      .toBuffer();
  } catch (e) {
    if (e instanceof DomainError) throw e;
    throw new DomainError("INVALID", "Cette image est illisible : essayez une autre photo");
  }
  await savePhoto(userId, out);
  await db.user.update({ where: { id: userId }, data: { avatarPhotoAt: new Date() } });
}

/** Un admin d'un club remet l'avatar par défaut d'un membre de ce club (photo inappropriée). */
export async function resetMemberAvatar(actorId: string, clubId: string, targetUserId: string): Promise<void> {
  if ((await getClubRole(actorId, clubId)) !== "ADMIN") throw new DomainError("FORBIDDEN", "Action réservée aux admins du club");
  if (!(await getClubRole(targetUserId, clubId))) throw new DomainError("NOT_FOUND", "Membre introuvable");
  const target = await db.user.findUniqueOrThrow({ where: { id: targetUserId }, select: { avatarKey: true } });
  await db.user.update({
    where: { id: targetUserId },
    data: { avatarKey: isAvatarKey(target.avatarKey) ? target.avatarKey : AVATARS[0].key, avatarPhotoAt: null },
  });
  await deletePhoto(targetUserId);
}

/** Photo d'un compte, pour son propre propriétaire ou un membre d'un club qu'ils ont en commun. Sinon null. */
export async function getPhotoFor(viewerId: string, ownerId: string): Promise<Buffer | null> {
  if (viewerId !== ownerId) {
    const shared = await db.clubMembership.findFirst({
      where: { userId: viewerId, club: { memberships: { some: { userId: ownerId } } } },
      select: { userId: true },
    });
    if (!shared) return null;
  }
  const owner = await db.user.findUnique({ where: { id: ownerId }, select: { avatarPhotoAt: true } });
  if (!owner?.avatarPhotoAt) return null;
  return readPhoto(ownerId);
}
