-- Tranche 30 : plus de code d'invitation ; un admin peut retirer un membre (qui doit alors demander à revenir).
DROP INDEX IF EXISTS "Club_inviteCode_key";
ALTER TABLE "Club" DROP COLUMN "inviteCode";

CREATE TABLE "ClubRemoval" (
    "userId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "removedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedById" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3),

    CONSTRAINT "ClubRemoval_pkey" PRIMARY KEY ("userId","clubId")
);

CREATE INDEX "ClubRemoval_clubId_requestedAt_idx" ON "ClubRemoval"("clubId", "requestedAt");

ALTER TABLE "ClubRemoval" ADD CONSTRAINT "ClubRemoval_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClubRemoval" ADD CONSTRAINT "ClubRemoval_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClubRemoval" ADD CONSTRAINT "ClubRemoval_removedById_fkey" FOREIGN KEY ("removedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
