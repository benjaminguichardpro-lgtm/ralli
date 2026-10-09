-- Archivage des rencontres terminées ou annulées : date et auteur, réversible (rien n'est supprimé).
ALTER TABLE "Encounter" ADD COLUMN "archivedAt" TIMESTAMP(3),
                        ADD COLUMN "archivedById" TEXT;

ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_archivedById_fkey"
  FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Une rencontre n'est archivée que terminée (CONFIRMED) ou annulée (CANCELLED).
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_archived_status_check"
  CHECK ("archivedAt" IS NULL OR "status" IN ('CONFIRMED', 'CANCELLED'));
