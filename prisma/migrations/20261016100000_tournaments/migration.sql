-- Tranche 36 : tournois à élimination directe avec pronostics.
CREATE TYPE "TournamentStatus" AS ENUM ('DRAFT', 'OPEN', 'FINISHED', 'CANCELLED');

CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "drawSize" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "status" "TournamentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "winnerId" TEXT,
    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TournamentEntry" (
    "tournamentId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TournamentEntry_pkey" PRIMARY KEY ("tournamentId","playerId")
);

CREATE TABLE "TournamentMatch" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "homePlayerId" TEXT,
    "awayPlayerId" TEXT,
    "startsAt" TIMESTAMP(3),
    "oddsHomeX100" INTEGER,
    "oddsAwayX100" INTEGER,
    "oddsComputedAt" TIMESTAMP(3),
    "oddsInputs" JSONB,
    "outcome" "MatchOutcome",
    "winnerSide" "Side",
    "sets" JSONB,
    "settledAt" TIMESTAMP(3),
    CONSTRAINT "TournamentMatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TournamentMatch_tournamentId_round_position_key" ON "TournamentMatch"("tournamentId", "round", "position");
CREATE INDEX "Tournament_clubId_status_idx" ON "Tournament"("clubId", "status");
CREATE INDEX "TournamentEntry_playerId_idx" ON "TournamentEntry"("playerId");
CREATE INDEX "TournamentMatch_homePlayerId_idx" ON "TournamentMatch"("homePlayerId");
CREATE INDEX "TournamentMatch_awayPlayerId_idx" ON "TournamentMatch"("awayPlayerId");

ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TournamentEntry" ADD CONSTRAINT "TournamentEntry_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TournamentEntry" ADD CONSTRAINT "TournamentEntry_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_homePlayerId_fkey" FOREIGN KEY ("homePlayerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_awayPlayerId_fkey" FOREIGN KEY ("awayPlayerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Un pronostic porte sur un match d'interclubs OU sur un match de tournoi, jamais les deux, jamais aucun.
ALTER TABLE "Prediction" ALTER COLUMN "matchId" DROP NOT NULL;
ALTER TABLE "Prediction" ADD COLUMN "tournamentMatchId" TEXT;
CREATE UNIQUE INDEX "Prediction_userId_tournamentMatchId_key" ON "Prediction"("userId", "tournamentMatchId");
CREATE INDEX "Prediction_tournamentMatchId_idx" ON "Prediction"("tournamentMatchId");
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_tournamentMatchId_fkey" FOREIGN KEY ("tournamentMatchId") REFERENCES "TournamentMatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_one_target_check" CHECK (("matchId" IS NULL) <> ("tournamentMatchId" IS NULL));

-- Garde-fous du tournoi : taille du tableau, numéros de tour et de position, un match ne s'oppose pas à lui-même, vainqueur seulement avec une issue.
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_draw_size_check" CHECK ("drawSize" IN (4, 8, 16, 32));
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_round_check" CHECK ("round" BETWEEN 1 AND 5 AND "position" >= 0);
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_players_check" CHECK ("homePlayerId" IS NULL OR "awayPlayerId" IS NULL OR "homePlayerId" <> "awayPlayerId");
ALTER TABLE "TournamentMatch" ADD CONSTRAINT "TournamentMatch_result_check" CHECK (("outcome" IS NULL) = ("winnerSide" IS NULL) AND ("outcome" IS NULL OR "outcome" <> 'NOT_PLAYED'));
