-- Tranche C : carte des clubs. Position (API adresse) et région (déduite du code postal), facultatives.
ALTER TABLE "Club" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "Club" ADD COLUMN "longitude" DOUBLE PRECISION;
ALTER TABLE "Club" ADD COLUMN "region" TEXT;
ALTER TABLE "Club" ADD CONSTRAINT "Club_position_check" CHECK (
  ("latitude" IS NULL AND "longitude" IS NULL)
  OR ("latitude" IS NOT NULL AND "longitude" IS NOT NULL AND "latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)
);
