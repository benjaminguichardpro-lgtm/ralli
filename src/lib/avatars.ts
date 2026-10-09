// Avatars prédéfinis (fichiers dans public/avatar/) et règles de la photo importée. Fonctions pures.

export const AVATARS = [
  { key: "service", label: "Le service" },
  { key: "revers", label: "Le revers" },
  { key: "volee", label: "La volée" },
  { key: "smash", label: "Le smash" },
  { key: "coup-droit", label: "Le coup droit" },
  { key: "casquette", label: "La casquette" },
  { key: "bandeau", label: "Le bandeau" },
  { key: "balle", label: "La balle" },
  { key: "raquette", label: "La raquette" },
  { key: "filet", label: "Le filet" },
  { key: "trophee", label: "Le trophée" },
  { key: "terre-battue", label: "La terre battue" },
] as const;

export type AvatarKey = (typeof AVATARS)[number]["key"];

export const DEFAULT_AVATAR_KEY: AvatarKey = "service";

export function isAvatarKey(v: unknown): v is AvatarKey {
  return typeof v === "string" && AVATARS.some((a) => a.key === v);
}

/** Avatar attribué à l'inscription : le tirage est passé en paramètre (testable). */
export function pickAvatarKey(random: () => number = Math.random): AvatarKey {
  return AVATARS[Math.min(AVATARS.length - 1, Math.floor(random() * AVATARS.length))]!.key;
}

/** Ce qu'il faut savoir d'un compte pour afficher son avatar. */
export type AvatarRef = { id: string; avatarKey: string; avatarPhotoAt: Date | null };

/** Adresse de l'image : la photo si elle existe (la date change l'adresse, donc rafraîchit les caches), sinon l'avatar prédéfini. */
export function avatarSrc(a: AvatarRef): string {
  if (a.avatarPhotoAt) return `/api/avatar/${a.id}?v=${a.avatarPhotoAt.getTime()}`;
  return `/avatar/${isAvatarKey(a.avatarKey) ? a.avatarKey : DEFAULT_AVATAR_KEY}.svg`;
}

export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_SIZE_PX = 256;
export const PHOTO_FORMATS = ["jpeg", "png", "webp"] as const;
