-- Tranche 28 : rallis gagnants en story (carte automatique, commentaire de 140 caractères, réaction 🎾, signalement).
ALTER TABLE "Story" ADD COLUMN "predictionId" TEXT;
CREATE INDEX "Story_predictionId_idx" ON "Story"("predictionId");
ALTER TABLE "Story" ADD CONSTRAINT "Story_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Une seule carte non supprimée par ralli ; une annonce a 1 à 280 caractères, une carte un commentaire de 0 à 140 et un ralli.
CREATE UNIQUE INDEX "Story_one_card_per_prediction" ON "Story"("predictionId") WHERE "predictionId" IS NOT NULL AND "deletedAt" IS NULL;
ALTER TABLE "Story" DROP CONSTRAINT "Story_body_length_check";
ALTER TABLE "Story" ADD CONSTRAINT "Story_body_length_check" CHECK (
  ("kind" = 'CLUB_POST' AND "predictionId" IS NULL AND char_length("body") BETWEEN 1 AND 280)
  OR ("kind" = 'WIN_CARD' AND "predictionId" IS NOT NULL AND char_length("body") <= 140)
);

CREATE TABLE "StoryReaction" (
    "storyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryReaction_pkey" PRIMARY KEY ("storyId","userId")
);
CREATE INDEX "StoryReaction_userId_idx" ON "StoryReaction"("userId");
ALTER TABLE "StoryReaction" ADD CONSTRAINT "StoryReaction_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoryReaction" ADD CONSTRAINT "StoryReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "StoryReport" (
    "storyId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handledAt" TIMESTAMP(3),
    "handledById" TEXT,

    CONSTRAINT "StoryReport_pkey" PRIMARY KEY ("storyId","reporterId")
);
CREATE INDEX "StoryReport_storyId_handledAt_idx" ON "StoryReport"("storyId", "handledAt");
ALTER TABLE "StoryReport" ADD CONSTRAINT "StoryReport_reason_length_check" CHECK ("reason" IS NULL OR char_length("reason") <= 200);
ALTER TABLE "StoryReport" ADD CONSTRAINT "StoryReport_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoryReport" ADD CONSTRAINT "StoryReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoryReport" ADD CONSTRAINT "StoryReport_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
