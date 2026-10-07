// Vide toutes les tables métier avant chaque test (TRUNCATE est permis par le trigger du ledger).
import { afterAll, beforeEach } from "vitest";
import { db } from "@/lib/db";

const TABLES = [
  "LedgerEntry",
  "Prediction",
  "Match",
  "EncounterEvent",
  "Encounter",
  "TeamPlayer",
  "Player",
  "Team",
  "ClubMembership",
  "Club",
  "User",
];

beforeEach(async () => {
  await db.$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(", ")} CASCADE`);
});

afterAll(async () => {
  await db.$disconnect();
});
