import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { type Locator, type Page, expect } from "@playwright/test";
import { parse } from "dotenv";
import { Client } from "pg";
import { findForbiddenWords } from "../../src/lib/vocabulary";

const SHOTS = "test-results/screens";

/** Vérifs communes à chaque page : vocabulaire, mention légale, boutons ≥ 44 px. */
export async function checkPage(page: Page, shot?: string) {
  await page.waitForLoadState("networkidle");
  const text = await page.locator("body").innerText();
  expect(findForbiddenWords(text), `mots interdits sur ${page.url()}`).toEqual([]);
  await expect(page.getByText("Jeu gratuit, sans argent réel, réservé aux 18 ans et plus.")).toBeVisible();
  const heights = await page
    // Cases à cocher et boutons radio : la zone tactile est leur <label>, mesuré à la place.
    .locator(
      "main button, main a.inline-flex, main input:not([type=hidden]):not([type=checkbox]):not([type=radio]), main label:has(> input[type=checkbox]), main label:has(> input[type=radio])",
    )
    .evaluateAll((els) =>
      els
        // Next 16 garde les écrans précédents dans le DOM, masqués (display: none) : on ne mesure que le visible.
        .filter((e) => e.getClientRects().length > 0)
        .map((e) => [e.textContent?.trim() || (e as HTMLInputElement).name, e.getBoundingClientRect().height] as const),
    );
  for (const [label, h] of heights) expect(h, `hauteur de « ${label} »`).toBeGreaterThanOrEqual(44);
  if (shot) await page.screenshot({ path: `${SHOTS}/${shot}.png`, fullPage: true });
}

export async function signUp(page: Page, name: string, opts: { checkAge?: boolean; email?: string } = {}) {
  await page.goto("/inscription");
  await page.getByLabel("Email").fill(opts.email ?? `${name.toLowerCase()}@club.test`);
  await page.getByLabel("Pseudo").fill(name);
  await page.getByLabel("Mot de passe").fill("motdepasse");
  if (opts.checkAge !== false) await page.getByLabel("J'ai 18 ans ou plus").check();
  await page.getByRole("button", { name: "Créer mon compte" }).click();
}

/** Connexion par email (par défaut) ou, avec `identifier`, par ce texte tel quel (pseudo, éventuellement en autres majuscules). */
export async function signIn(page: Page, name: string, password = "motdepasse", identifier?: string) {
  await page.goto("/connexion");
  await page.getByLabel("Email ou pseudo").fill(identifier ?? `${name.toLowerCase()}@club.test`);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
}

/** Lance le vrai script CLI de dépannage contre la base de test. */
export function resetPassword(email: string): string {
  const env = parse(readFileSync(".env.test"));
  const out = execFileSync("npx", ["tsx", "scripts/reset-password.ts", email], {
    env: { ...process.env, ...env, BCRYPT_ROUNDS: "4" },
    encoding: "utf8",
  });
  const m = /Mot de passe temporaire : (\S+)/.exec(out);
  if (!m?.[1]) throw new Error(`Sortie inattendue : ${out}`);
  return m[1];
}

/**
 * Fait « commencer » une rencontre : recule l'heure de début et de fermeture des pronostics d'une heure.
 * Aucun écran ne permet de saisir une date passée, donc on passe par la base de TEST.
 */
export async function forceStarted(encounterUrl: string) {
  const id = encounterUrl.split("/").pop()!;
  const c = new Client({ connectionString: parse(readFileSync(".env.test")).DATABASE_URL });
  await c.connect();
  await c.query(`UPDATE "Encounter" SET "startsAt" = now() - interval '1 hour', "predictionsCloseAt" = now() - interval '1 hour' WHERE id = $1`, [id]);
  await c.end();
}

/**
 * Pronostic par le parcours en trois gestes : toucher la cote, saisir/choisir un montant, valider.
 * `match` est la ligne du simple (un <li> de la page de la rencontre) ; `pick` désigne le bouton de cote, ex. /Léa M\. gagne/.
 */
export async function placeBet(page: Page, match: Locator, pick: RegExp, aces: string) {
  await match.getByRole("button", { name: pick }).click();
  const sheet = page.getByRole("dialog", { name: "Votre pronostic" });
  await expect(sheet).toBeVisible();
  await sheet.getByLabel("Aces engagés").fill(aces);
  await sheet.getByRole("button", { name: "Valider mon ralli" }).click();
  await expect(sheet).toBeHidden();
}
