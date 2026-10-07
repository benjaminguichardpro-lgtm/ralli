-- Heure de fermeture des pronostics, distincte de l'heure de début (report après le début).
-- Ajoutée vide, remplie depuis startsAt pour d'éventuelles lignes existantes, puis rendue obligatoire.
ALTER TABLE "Encounter" ADD COLUMN "predictionsCloseAt" TIMESTAMP(3);
UPDATE "Encounter" SET "predictionsCloseAt" = "startsAt" WHERE "predictionsCloseAt" IS NULL;
ALTER TABLE "Encounter" ALTER COLUMN "predictionsCloseAt" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Encounter_status_predictionsCloseAt_idx" ON "Encounter"("status", "predictionsCloseAt");

-- Match retiré ou remplacé après publication.
ALTER TABLE "Match" ADD COLUMN "voidedAt" TIMESTAMP(3);
