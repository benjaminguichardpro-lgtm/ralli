// Vide la base de TEST avant la suite E2E.
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { Client } from "pg";

export default async function setup() {
  const env = parse(readFileSync(".env.test"));
  const devUrl = parse(readFileSync(".env")).DATABASE_URL;
  if (!env.DATABASE_URL || env.DATABASE_URL === devUrl) throw new Error("E2E : .env.test doit pointer sur une base distincte");
  const c = new Client({ connectionString: env.DATABASE_URL });
  await c.connect();
  await c.query(
    `TRUNCATE "LedgerEntry","Prediction","Match","EncounterEvent","Encounter","TeamPlayer","Player","Team","ClubMembership","Club","User","AuthAttempt" CASCADE`,
  );
  await c.end();
}
