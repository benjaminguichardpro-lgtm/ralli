-- CreateEnum
CREATE TYPE "StoryKind" AS ENUM ('CLUB_POST', 'WIN_CARD');

-- CreateTable
CREATE TABLE "Story" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "teamId" TEXT,
    "kind" "StoryKind" NOT NULL DEFAULT 'CLUB_POST',
    "body" TEXT NOT NULL,
    "background" TEXT NOT NULL,
    "onWall" BOOLEAN NOT NULL DEFAULT false,
    "pinnedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,

    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryView" (
    "storyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryView_pkey" PRIMARY KEY ("storyId","userId")
);

-- CreateIndex
CREATE INDEX "Story_clubId_expiresAt_idx" ON "Story"("clubId", "expiresAt");

-- CreateIndex
CREATE INDEX "Story_clubId_onWall_createdAt_idx" ON "Story"("clubId", "onWall", "createdAt");

-- CreateIndex
CREATE INDEX "StoryView_userId_idx" ON "StoryView"("userId");

-- Garde-fous : un seul message épinglé par club, texte de 1 à 280 caractères, épinglé seulement sur le mur
CREATE UNIQUE INDEX "Story_one_pinned_per_club" ON "Story"("clubId") WHERE "pinnedAt" IS NOT NULL AND "deletedAt" IS NULL;
ALTER TABLE "Story" ADD CONSTRAINT "Story_body_length_check" CHECK (char_length("body") BETWEEN 1 AND 280);
ALTER TABLE "Story" ADD CONSTRAINT "Story_pinned_on_wall_check" CHECK ("pinnedAt" IS NULL OR "onWall");

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Story" ADD CONSTRAINT "Story_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Story" ADD CONSTRAINT "Story_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Story" ADD CONSTRAINT "Story_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StoryView" ADD CONSTRAINT "StoryView_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoryView" ADD CONSTRAINT "StoryView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
