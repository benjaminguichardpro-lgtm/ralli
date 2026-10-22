-- « Interclubs à venir » démarre sur « Mes clubs » (0 km), comme l'accueil d'avant : le fil ne change pas pour les comptes existants.
-- Les comptes restés sur l'ancien réglage par défaut (30 km) passent à 0 ; un autre rayon choisi est conservé.
ALTER TABLE "User" ALTER COLUMN "nearbyRadiusKm" SET DEFAULT 0;
UPDATE "User" SET "nearbyRadiusKm" = 0 WHERE "nearbyRadiusKm" = 30;
