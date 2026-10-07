// Vérifie que la base de TEST répond et applique les migrations avant les tests d'intégration.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { Client } from "pg";

export default async function setup() {
  const env = parse(readFileSync(new URL("../../.env.test", import.meta.url)));
  const url = env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL absente de .env.test");
  // Garde-fou : jamais sur la base de dev.
  const devUrl = (() => {
    try {
      return parse(readFileSync(new URL("../../.env", import.meta.url))).DATABASE_URL;
    } catch {
      return undefined;
    }
  })();
  if (devUrl && devUrl === url) throw new Error(".env.test pointe sur la même base que .env : refus de lancer les tests");

  const client = new Client({ connectionString: url });
  try {
    await client.connect();
  } catch {
    throw new Error(`Base de test injoignable (${new URL(url).host}). Lancer : npm run db:test:start`);
  } finally {
    await client.end().catch(() => {});
  }
  execSync("npx prisma migrate deploy", { env: { ...process.env, ...env }, stdio: "pipe" });
}
