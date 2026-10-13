import { type CollectionData, type RingData, StoriesBar, type StoryData, type TargetData } from "./stories-bar";
import { listClubWall, listPublishTargets, listStoryRings } from "@/server/stories";

const toStoryData = (s: Awaited<ReturnType<typeof listStoryRings>>[number]["stories"][number]): StoryData => ({ ...s, createdAt: s.createdAt.toISOString(), author: { ...s.author, avatarPhotoAt: s.author.avatarPhotoAt?.toISOString() ?? null } });

/**
 * Bandeau de stories d'un compte (tous ses clubs, ou un seul avec `clubId`). Rien du tout s'il n'y a ni story ni droit de publier.
 * Avec `clubId`, « à la une » du club (collections nommées) s'affiche aussi sous le bandeau.
 */
export async function StoriesSection({ userId, clubId, clubName }: { userId: string; clubId?: string; clubName?: string }) {
  const [rings, allTargets, wall] = await Promise.all([
    listStoryRings(userId, { clubId }),
    listPublishTargets(userId),
    clubId ? listClubWall(userId, clubId) : Promise.resolve(null),
  ]);
  const targets: TargetData[] = clubId ? allTargets.filter((t) => t.clubId === clubId) : allTargets;
  const data: RingData[] = rings.map((r) => ({ ...r, logoUpdatedAt: r.logoUpdatedAt?.toISOString() ?? null, stories: r.stories.map(toStoryData) }));
  const collections: CollectionData[] = (wall?.collections ?? []).map((c) => ({
    id: c.id,
    clubId: clubId!,
    clubName: clubName ?? "",
    logoUpdatedAt: null,
    name: c.name,
    pinned: c.pinned,
    isAdmin: wall!.isAdmin,
    coverBackground: c.coverBackground,
    stories: c.stories.map(toStoryData),
  }));
  return <StoriesBar rings={data} targets={targets} collections={collections} />;
}
