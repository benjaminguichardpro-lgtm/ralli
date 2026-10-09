-- Doubles : un match peut opposer deux joueurs à deux joueurs, et valoir 1 ou 2 points au score final.
CREATE TYPE "MatchKind" AS ENUM ('SINGLES', 'DOUBLES');

ALTER TABLE "Match"
  ADD COLUMN "kind" "MatchKind" NOT NULL DEFAULT 'SINGLES',
  ADD COLUMN "points" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "homePlayer2Id" TEXT,
  ADD COLUMN "awayPlayer2Id" TEXT;

ALTER TABLE "Match" ADD CONSTRAINT "Match_homePlayer2Id_fkey" FOREIGN KEY ("homePlayer2Id") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Match" ADD CONSTRAINT "Match_awayPlayer2Id_fkey" FOREIGN KEY ("awayPlayer2Id") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Match_homePlayer2Id_idx" ON "Match"("homePlayer2Id");
CREATE INDEX "Match_awayPlayer2Id_idx" ON "Match"("awayPlayer2Id");

-- Un match vaut 1 ou 2 points.
ALTER TABLE "Match" ADD CONSTRAINT "Match_points_check" CHECK ("points" IN (1, 2));

-- Un simple n'a que deux joueurs ; un double en a quatre, tous différents côté par côté.
ALTER TABLE "Match" ADD CONSTRAINT "Match_kind_players_check" CHECK (
  ("kind" = 'SINGLES' AND "homePlayer2Id" IS NULL AND "awayPlayer2Id" IS NULL)
  OR ("kind" = 'DOUBLES' AND "homePlayer2Id" IS NOT NULL AND "awayPlayer2Id" IS NOT NULL
      AND "homePlayer2Id" <> "homePlayerId" AND "awayPlayer2Id" <> "awayPlayerId")
);
