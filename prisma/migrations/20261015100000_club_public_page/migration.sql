-- Tranche 34 : page publique d'un club (/c/<slug>), désactivée par défaut, activée par les admins.
ALTER TABLE "Club" ADD COLUMN "publicPage" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Club" ADD COLUMN "slug" TEXT;
CREATE UNIQUE INDEX "Club_slug_key" ON "Club"("slug");

-- Garde-fou : minuscules, chiffres et tirets (jamais au début ni à la fin), 3 à 50 caractères ; une page publique a toujours un slug.
ALTER TABLE "Club" ADD CONSTRAINT "Club_slug_check" CHECK ("slug" IS NULL OR "slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length("slug") BETWEEN 3 AND 50);
ALTER TABLE "Club" ADD CONSTRAINT "Club_public_slug_check" CHECK (NOT "publicPage" OR "slug" IS NOT NULL);
