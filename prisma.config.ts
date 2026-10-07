import "dotenv/config";
import { defineConfig } from "prisma/config";

// Les migrations passent par la connexion directe Neon (non poolée).
// L'application, elle, utilise DATABASE_URL (poolée) via l'adaptateur pg : voir src/lib/db.ts.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DIRECT_URL"],
  },
});
