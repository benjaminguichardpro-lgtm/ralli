import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
import { defineConfig } from "vitest/config";

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

function loadTestEnv(): Record<string, string> {
  try {
    return parse(readFileSync(new URL("./.env.test", import.meta.url)));
  } catch {
    throw new Error(".env.test introuvable : copier .env.test.example (voir README, « Tests »)");
  }
}

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
          exclude: ["**/*.db.test.ts"],
          environment: "node",
        },
      },
      {
        resolve: { alias },
        test: {
          name: "db",
          include: ["src/**/*.db.test.ts"],
          environment: "node",
          env: { ...loadTestEnv(), BCRYPT_ROUNDS: "4" },
          globalSetup: ["./tests/db/global-setup.ts"],
          setupFiles: ["./tests/db/reset.ts"],
          // Une seule base partagée : fichiers exécutés l'un après l'autre.
          fileParallelism: false,
        },
      },
    ],
  },
});
