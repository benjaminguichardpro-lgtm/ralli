-- Limite d'essais à la connexion et à l'inscription (src/server/rate-limit.ts).
CREATE TABLE "AuthAttempt" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuthAttempt_scope_keyHash_createdAt_idx" ON "AuthAttempt"("scope", "keyHash", "createdAt");
CREATE INDEX "AuthAttempt_createdAt_idx" ON "AuthAttempt"("createdAt");

-- La case « 18 ans ou plus » n'existe plus depuis le 2026-10-09 : la colonne d'héritage disparaît.
ALTER TABLE "User" DROP COLUMN "ageConfirmedAt";
