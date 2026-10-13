-- Tranche 32 : rencontres à proximité. Code postal (facultatif, privé), centre de la commune, rayon de recherche (30 km par défaut).
ALTER TABLE "User" ADD COLUMN "postalCode" TEXT;
ALTER TABLE "User" ADD COLUMN "commune" TEXT;
ALTER TABLE "User" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "User" ADD COLUMN "longitude" DOUBLE PRECISION;
ALTER TABLE "User" ADD COLUMN "nearbyRadiusKm" INTEGER NOT NULL DEFAULT 30;

-- Garde-fous : code postal à 5 chiffres, les deux coordonnées ensemble et dans les limites, rayon de 1 à 200 km.
ALTER TABLE "User" ADD CONSTRAINT "User_postal_code_check" CHECK ("postalCode" IS NULL OR "postalCode" ~ '^[0-9]{5}$');
ALTER TABLE "User" ADD CONSTRAINT "User_position_check" CHECK (
  ("latitude" IS NULL AND "longitude" IS NULL)
  OR ("latitude" IS NOT NULL AND "longitude" IS NOT NULL AND "latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)
);
ALTER TABLE "User" ADD CONSTRAINT "User_nearby_radius_check" CHECK ("nearbyRadiusKm" BETWEEN 1 AND 200);
