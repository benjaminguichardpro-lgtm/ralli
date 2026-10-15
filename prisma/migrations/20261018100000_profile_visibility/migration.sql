-- Visibilité du profil d'un membre pour les membres de ses clubs (activée par défaut ; la personne peut la désactiver).
ALTER TABLE "User" ADD COLUMN "profilePublic" BOOLEAN NOT NULL DEFAULT true;
