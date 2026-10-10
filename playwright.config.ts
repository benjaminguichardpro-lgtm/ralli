import { readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import { parse } from "dotenv";

// Les E2E tournent contre le build de production (`next start`) branché sur la base de TEST.
const testEnv = parse(readFileSync(".env.test"));
const PORT = 3100;

export default defineConfig({
  testDir: "./tests/e2e",
  // Les scénarios de mise en place (clubs, équipes, joueurs, rencontre, plusieurs comptes) sont longs : 60 s de marge, la machine pouvant ralentir (iCloud, serveur de dev).
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["iPhone 13"],
    browserName: "chromium",
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    env: { ...testEnv, BCRYPT_ROUNDS: "4", AVATAR_DIR: "test-results/avatar-e2e" },
    timeout: 60_000,
  },
});
