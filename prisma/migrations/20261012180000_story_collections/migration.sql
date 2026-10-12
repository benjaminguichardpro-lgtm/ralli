-- CreateTable
CREATE TABLE "StoryCollection" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "pinnedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryCollection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoryCollection_clubId_nameKey_key" ON "StoryCollection"("clubId", "nameKey");

-- Garde-fous : une seule collection épinglée par club, nom de 1 à 40 caractères
CREATE UNIQUE INDEX "StoryCollection_one_pinned_per_club" ON "StoryCollection"("clubId") WHERE "pinnedAt" IS NOT NULL;
ALTER TABLE "StoryCollection" ADD CONSTRAINT "StoryCollection_name_length_check" CHECK (char_length("name") BETWEEN 1 AND 40);

-- AddForeignKey
ALTER TABLE "StoryCollection" ADD CONSTRAINT "StoryCollection_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Story" ADD COLUMN "collectionId" TEXT;
CREATE INDEX "Story_collectionId_idx" ON "Story"("collectionId");
ALTER TABLE "Story" ADD CONSTRAINT "Story_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "StoryCollection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Reprise des publications déjà posées sur le mur : une collection par nom (« Mur » si elles n'avaient pas de nom)
INSERT INTO "StoryCollection"("id", "clubId", "name", "nameKey", "pinnedAt", "createdAt")
SELECT 'col_' || md5("clubId" || lower(coalesce("wallTitle", 'Mur'))),
       "clubId",
       min(coalesce("wallTitle", 'Mur')),
       lower(coalesce("wallTitle", 'Mur')),
       min("pinnedAt"),
       min("createdAt")
FROM "Story"
WHERE "onWall" AND "deletedAt" IS NULL
GROUP BY "clubId", lower(coalesce("wallTitle", 'Mur'));

UPDATE "Story" SET "collectionId" = 'col_' || md5("clubId" || lower(coalesce("wallTitle", 'Mur')))
WHERE "onWall" AND "deletedAt" IS NULL;

-- Les anciennes colonnes disparaissent (le mur = appartenir à une collection)
DROP INDEX "Story_one_pinned_per_club";
DROP INDEX "Story_clubId_onWall_createdAt_idx";
ALTER TABLE "Story" DROP CONSTRAINT "Story_pinned_on_wall_check";
ALTER TABLE "Story" DROP CONSTRAINT "Story_wallTitle_length_check";
ALTER TABLE "Story" DROP COLUMN "onWall", DROP COLUMN "wallTitle", DROP COLUMN "pinnedAt";
