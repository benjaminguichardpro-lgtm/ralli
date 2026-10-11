-- CreateEnum
CREATE TYPE "ClubRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REFUSED');

-- CreateTable
CREATE TABLE "ClubCreationRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "clubName" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "fftNumber" TEXT NOT NULL,
    "website" TEXT,
    "phone" TEXT NOT NULL,
    "message" TEXT,
    "status" "ClubRequestStatus" NOT NULL DEFAULT 'PENDING',
    "refusalReason" TEXT,
    "decidedAt" TIMESTAMP(3),
    "clubId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClubCreationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClubCreationRequest_userId_status_idx" ON "ClubCreationRequest"("userId", "status");

-- Une seule demande en attente par compte
CREATE UNIQUE INDEX "ClubCreationRequest_one_pending_per_user" ON "ClubCreationRequest"("userId") WHERE "status" = 'PENDING';

-- AddForeignKey
ALTER TABLE "ClubCreationRequest" ADD CONSTRAINT "ClubCreationRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
