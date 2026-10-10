-- Fiche du club : informations facultatives saisies par les admins, et date du dernier logo (null = pas de logo).
ALTER TABLE "Club" ADD COLUMN "foundedYear" INTEGER,
                   ADD COLUMN "licenseeCount" INTEGER,
                   ADD COLUMN "address" TEXT,
                   ADD COLUMN "postalCode" TEXT,
                   ADD COLUMN "city" TEXT,
                   ADD COLUMN "websiteUrl" TEXT,
                   ADD COLUMN "description" TEXT,
                   ADD COLUMN "indoorCourts" INTEGER,
                   ADD COLUMN "outdoorCourts" INTEGER,
                   ADD COLUMN "logoUpdatedAt" TIMESTAMP(3);

-- Garde-fous : la base refuse des valeurs absurdes même si l'application avait un défaut.
ALTER TABLE "Club" ADD CONSTRAINT "Club_foundedYear_check" CHECK ("foundedYear" IS NULL OR "foundedYear" BETWEEN 1800 AND 2100);
ALTER TABLE "Club" ADD CONSTRAINT "Club_licenseeCount_check" CHECK ("licenseeCount" IS NULL OR "licenseeCount" BETWEEN 0 AND 10000);
ALTER TABLE "Club" ADD CONSTRAINT "Club_indoorCourts_check" CHECK ("indoorCourts" IS NULL OR "indoorCourts" BETWEEN 0 AND 100);
ALTER TABLE "Club" ADD CONSTRAINT "Club_outdoorCourts_check" CHECK ("outdoorCourts" IS NULL OR "outdoorCourts" BETWEEN 0 AND 100);
ALTER TABLE "Club" ADD CONSTRAINT "Club_text_lengths_check" CHECK (
  ("address" IS NULL OR char_length("address") <= 200)
  AND ("postalCode" IS NULL OR char_length("postalCode") <= 20)
  AND ("city" IS NULL OR char_length("city") <= 100)
  AND ("websiteUrl" IS NULL OR (char_length("websiteUrl") <= 300 AND "websiteUrl" ~ '^https?://'))
  AND ("description" IS NULL OR char_length("description") <= 500)
);
