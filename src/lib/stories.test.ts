import { describe, expect, it } from "vitest";
import { STORY_BODY_MAX, STORY_LIFETIME_MS, createStorySchema, isStoryLive, storyBodySchema, storyExpiry } from "./stories";

describe("stories", () => {
  it("expire 24 h après la création", () => {
    const t = new Date("2026-10-12T10:00:00Z");
    expect(storyExpiry(t).getTime() - t.getTime()).toBe(STORY_LIFETIME_MS);
  });

  it("vivante tant que ni supprimée ni expirée", () => {
    const now = new Date("2026-10-12T10:00:00Z");
    const future = new Date("2026-10-12T10:00:01Z");
    expect(isStoryLive({ expiresAt: future, deletedAt: null }, now)).toBe(true);
    expect(isStoryLive({ expiresAt: now, deletedAt: null }, now)).toBe(false);
    expect(isStoryLive({ expiresAt: future, deletedAt: now }, now)).toBe(false);
  });

  it("texte : 1 à 280 caractères, mots interdits refusés", () => {
    expect(storyBodySchema.safeParse("   ").success).toBe(false);
    expect(storyBodySchema.safeParse("a".repeat(STORY_BODY_MAX)).success).toBe(true);
    expect(storyBodySchema.safeParse("a".repeat(STORY_BODY_MAX + 1)).success).toBe(false);
    expect(storyBodySchema.safeParse("Rendez-vous samedi 13 h au club").success).toBe(true);
    expect(storyBodySchema.safeParse("Faites vos paris pour samedi").success).toBe(false);
    expect(storyBodySchema.safeParse("Votre mise est ouverte").success).toBe(false);
  });

  it("fond inconnu refusé, équipe vide = tout le club", () => {
    const base = { clubId: "c", teamId: "", body: "Salut", background: "brand", onWall: false };
    expect(createStorySchema.parse(base).teamId).toBeNull();
    expect(createStorySchema.safeParse({ ...base, background: "rose" }).success).toBe(false);
  });
});
