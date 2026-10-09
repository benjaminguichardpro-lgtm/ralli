-- Avatar du compte : avatar prédéfini + date de la photo importée (le fichier est dans le dossier avatar/).
ALTER TABLE "User" ADD COLUMN "avatarKey" TEXT NOT NULL DEFAULT 'service',
                   ADD COLUMN "avatarPhotoAt" TIMESTAMP(3);

-- Comptes existants : un avatar varié, au hasard mais stable.
UPDATE "User" SET "avatarKey" = (ARRAY['service','revers','volee','smash','coup-droit','casquette',
  'bandeau','balle','raquette','filet','trophee','terre-battue'])[1 + abs(hashtext("id")) % 12];
