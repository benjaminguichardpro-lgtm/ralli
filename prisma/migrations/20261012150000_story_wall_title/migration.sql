-- AlterTable
ALTER TABLE "Story" ADD COLUMN "wallTitle" TEXT;

-- Le nom, quand il existe, fait de 1 à 40 caractères
ALTER TABLE "Story" ADD CONSTRAINT "Story_wallTitle_length_check" CHECK ("wallTitle" IS NULL OR char_length("wallTitle") BETWEEN 1 AND 40);
