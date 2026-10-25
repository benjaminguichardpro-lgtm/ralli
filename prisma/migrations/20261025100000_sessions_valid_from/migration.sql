-- Les connexions ouvertes avant cette date ne sont plus valables (null = aucune limite : personne n'est déconnecté au déploiement).
ALTER TABLE "User" ADD COLUMN "sessionsValidFrom" TIMESTAMP(3);
