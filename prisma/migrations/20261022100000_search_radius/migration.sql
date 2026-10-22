-- Barre de distance (0 km = mes clubs seulement, 1 à 200 km, 999 = toute la France) pour « Interclub à proximité » et « Tournoi à venir ».
-- Le rayon des interclubs accepte maintenant 0 et 999 ; le rayon des tournois est un réglage séparé (0 par défaut : comme avant, mes clubs).
ALTER TABLE "User" DROP CONSTRAINT "User_nearby_radius_check";
ALTER TABLE "User" ADD CONSTRAINT "User_nearby_radius_check" CHECK ("nearbyRadiusKm" BETWEEN 0 AND 200 OR "nearbyRadiusKm" = 999);
ALTER TABLE "User" ADD COLUMN "tournamentRadiusKm" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD CONSTRAINT "User_tournament_radius_check" CHECK ("tournamentRadiusKm" BETWEEN 0 AND 200 OR "tournamentRadiusKm" = 999);
