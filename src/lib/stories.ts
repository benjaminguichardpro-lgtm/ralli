import { z } from "zod";
import { findForbiddenWords } from "./vocabulary";

export const STORY_BODY_MAX = 280;
export const COLLECTION_NAME_MAX = 40;
export const STORY_LIFETIME_MS = 24 * 60 * 60 * 1000;

/** Fonds proposés : uniquement des couleurs du thème (jamais de couleur en dur), avec le texte qui y est lisible. */
export const STORY_BACKGROUNDS = {
  brand: { label: "Vert Ralli", classes: "bg-brand text-on-primary" },
  primary: { label: "Vert action", classes: "bg-primary text-on-primary" },
  clay: { label: "Terre battue", classes: "bg-clay text-on-clay" },
  gold: { label: "Or", classes: "bg-gold text-on-gold" },
  pale: { label: "Vert pâle", classes: "bg-pale text-ink" },
} as const;
export type StoryBackground = keyof typeof STORY_BACKGROUNDS;
export const STORY_BACKGROUND_KEYS = Object.keys(STORY_BACKGROUNDS) as StoryBackground[];

export function isStoryBackground(v: string): v is StoryBackground {
  return v in STORY_BACKGROUNDS;
}

/** Clé d'unicité du nom d'une collection, sans tenir compte de la casse. */
export function collectionNameKey(name: string): string {
  return name.trim().toLocaleLowerCase("fr-FR");
}

export function storyExpiry(createdAt: Date): Date {
  return new Date(createdAt.getTime() + STORY_LIFETIME_MS);
}

/** Une story est visible tant qu'elle n'est ni supprimée ni expirée. */
export function isStoryLive(s: { expiresAt: Date; deletedAt: Date | null }, now: Date): boolean {
  return s.deletedAt === null && s.expiresAt.getTime() > now.getTime();
}

export const storyBodySchema = z
  .string({ error: "Texte requis" })
  .trim()
  .min(1, { error: "Texte requis" })
  .max(STORY_BODY_MAX, { error: `Au plus ${STORY_BODY_MAX} caractères` })
  .refine((t) => findForbiddenWords(t).length === 0, {
    error: "Ce texte contient un mot interdit dans Ralli (pari, mise, bookmaker, euro). Reformule-le.",
  });

export const collectionNameSchema = z
  .string({ error: "Nom requis" })
  .trim()
  .min(1, { error: "Nom requis" })
  .max(COLLECTION_NAME_MAX, { error: `Au plus ${COLLECTION_NAME_MAX} caractères` })
  .refine((t) => findForbiddenWords(t).length === 0, {
    error: "Ce nom contient un mot interdit dans Ralli (pari, mise, bookmaker, euro). Reformule-le.",
  });

export const createStorySchema = z.object({
  clubId: z.string().min(1).max(64),
  teamId: z
    .string()
    .max(64)
    .nullable()
    .transform((v) => v || null),
  body: storyBodySchema,
  background: z.string().refine(isStoryBackground, { error: "Fond inconnu" }),
  /** Admin : garder la story à la une du club, dans une collection existante (collectionId) ou nouvelle (collectionName). */
  onWall: z.boolean(),
  collectionId: z.string().max(64).nullable().optional(),
  collectionName: z.string().max(200).nullable().optional(),
});
export type CreateStoryInput = z.input<typeof createStorySchema>;
