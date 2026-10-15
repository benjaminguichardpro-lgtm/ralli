-- Date de naissance facultative d'un joueur (import et saisie par les admins du club ; jamais montrée aux autres).
ALTER TABLE "Player" ADD COLUMN "birthDate" DATE;
ALTER TABLE "Player" ADD CONSTRAINT "Player_birth_date_check" CHECK ("birthDate" IS NULL OR ("birthDate" >= DATE '1900-01-01' AND "birthDate" < DATE '2100-01-01'));
