-- Affiche de tournoi : sigle du tableau et lieu (Tournament), club en texte libre d'un joueur d'un autre club (Player),
-- et juges-arbitres d'un tournoi (nommés par un admin du club, autant que nécessaire).
ALTER TABLE "Tournament" ADD COLUMN "tableLabel" TEXT;
ALTER TABLE "Tournament" ADD COLUMN "venue" TEXT;
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_table_label_check" CHECK ("tableLabel" IS NULL OR char_length("tableLabel") BETWEEN 1 AND 12);
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_venue_check" CHECK ("venue" IS NULL OR char_length("venue") BETWEEN 1 AND 80);

ALTER TABLE "Player" ADD COLUMN "externalClubName" TEXT;
ALTER TABLE "Player" ADD CONSTRAINT "Player_external_club_name_check" CHECK ("externalClubName" IS NULL OR char_length("externalClubName") BETWEEN 1 AND 60);

CREATE TABLE "TournamentReferee" (
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedById" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentReferee_pkey" PRIMARY KEY ("tournamentId","userId")
);

CREATE INDEX "TournamentReferee_userId_idx" ON "TournamentReferee"("userId");

ALTER TABLE "TournamentReferee" ADD CONSTRAINT "TournamentReferee_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TournamentReferee" ADD CONSTRAINT "TournamentReferee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TournamentReferee" ADD CONSTRAINT "TournamentReferee_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
