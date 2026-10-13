-- Tranche 34 : suppression « douce » d'un club. Les données restent, le club disparaît partout.
ALTER TABLE "Club" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Club" ADD COLUMN "deletedById" TEXT;
ALTER TABLE "Club" ADD COLUMN "deletedMembership" JSONB;

-- Un club supprimé n'a plus de page publique ni d'adresse (elle est libre pour un autre club).
ALTER TABLE "Club" ADD CONSTRAINT "Club_deleted_check" CHECK ("deletedAt" IS NULL OR ("publicPage" = false AND "slug" IS NULL));
