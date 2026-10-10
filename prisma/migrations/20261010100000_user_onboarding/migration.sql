-- Guide du premier lancement et récapitulatif des pronostics réglés : deux dates sur le compte.
ALTER TABLE "User" ADD COLUMN "onboardingSeenAt" TIMESTAMP(3),
                   ADD COLUMN "resultsSeenAt" TIMESTAMP(3);

-- Comptes existants : ni guide ni récapitulatif de leur historique passé.
UPDATE "User" SET "onboardingSeenAt" = now(), "resultsSeenAt" = now();
