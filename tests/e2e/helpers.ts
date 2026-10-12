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
  // Les cartes apparaissent en douceur (animation « card-in », 0,3 s) : on mesure une fois qu'elles sont en place
  // (pendant l'animation, les hauteurs peuvent valoir 43,9999 px au lieu de 44).
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .filter((a) => a instanceof CSSAnimation && a.animationName === "card-in")
      .every((a) => a.playState === "finished"),
  );
  const text = await page.locator("body").innerText();
  expect(findForbiddenWords(text), `mots interdits sur ${page.url()}`).toEqual([]);
  // Pages du visiteur (carte verte rayée) : sans pied de page ; la mention « sans valeur réelle » est dans la carte.
  if ((await page.locator("[data-bare]").count()) === 0) await expect(page.getByText("Jeu gratuit, sans argent réel.", { exact: true })).toBeVisible();
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

export async function signUp(page: Page, name: string, opts: { email?: string } = {}) {
  await page.goto("/inscription");
  await page.getByLabel("Email").fill(opts.email ?? `${name.toLowerCase()}@club.test`);
  await page.getByLabel("Pseudo").fill(name);
  await page.getByLabel("Mot de passe", { exact: true }).fill("motdepasse");
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  // Inscription réussie : le guide s'affiche (parfois tard quand la machine est chargée). Inscription refusée (pseudo pris…) :
  // un message d'erreur s'affiche à la place. On attend l'un ou l'autre, sans délai fixe trop court.
  const guide = page.getByRole("dialog", { name: "Guide de démarrage" });
  // (L'élément « alerte » du routeur de Next.js est toujours présent et vide : on ne regarde que le contenu de la page.)
  await guide.or(page.locator('main [role="alert"]')).first().waitFor({ timeout: 30_000 }).catch(() => undefined);
  if (await guide.isVisible()) {
    await skipGuide(page);
    // Garde-fou contre les ratés de timing : on attend que la base ait bien enregistré le guide comme vu, sinon un changement de page
    // trop rapide le fait réapparaître.
    await expect
      .poll(async () => (await queryTestDb<{ seen: boolean }>(`SELECT "onboardingSeenAt" IS NOT NULL AS seen FROM "User" WHERE "displayName" = $1`, [name]))[0]?.seen, { timeout: 30_000 })
      .toBe(true);
  }
}

/** Exécute `trigger` (un clic, Échap…) et attend que la réponse du serveur soit revenue : l'enregistrement « vu » est alors terminé. */
export async function awaitServerAction(page: Page, trigger: () => Promise<void>) {
  const done = page.waitForResponse((r) => r.request().method() === "POST");
  await trigger();
  await done;
}

/** Passe le guide du premier lancement (fenêtre affichée à un compte neuf), pour que la suite du test ne soit pas bloquée. */
export async function skipGuide(page: Page) {
  const guide = page.getByRole("dialog", { name: "Guide de démarrage" });
  await awaitServerAction(page, () => guide.getByRole("button", { name: "Passer" }).click());
  await expect(guide).toBeHidden();
  // Les autres réponses du serveur (solde, bonus du jour) peuvent arriver avant celle du guide : on attend que tout soit fini,
  // sinon un changement de page trop rapide annule l'enregistrement et le guide réapparaît.
  await page.waitForLoadState("networkidle");
}

/** Connexion par email (par défaut) ou, avec `identifier`, par ce texte tel quel (pseudo, éventuellement en autres majuscules). */
export async function signIn(page: Page, name: string, password = "motdepasse", identifier?: string) {
  await page.goto("/connexion");
  await page.getByLabel("Email ou pseudo").fill(identifier ?? `${name.toLowerCase()}@club.test`);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
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

/** Recule la date de création d'un compte (le jour de l'inscription ne donne pas de bonus de connexion). */
export async function backdateAccount(displayName: string, days: number) {
  const c = new Client({ connectionString: parse(readFileSync(".env.test")).DATABASE_URL });
  await c.connect();
  await c.query(`UPDATE "User" SET "createdAt" = now() - ($2 || ' days')::interval WHERE "displayName" = $1`, [displayName, String(days)]);
  await c.end();
}

/** Accepte une demande « admin de club » pour tous les comptes qui n'ont pas déjà un droit de création disponible (la validation par l'équipe Ralli n'a pas d'écran). */
export async function allowClubCreation() {
  const c = new Client({ connectionString: parse(readFileSync(".env.test")).DATABASE_URL });
  await c.connect();
  await c.query(
    `INSERT INTO "ClubCreationRequest"(id,"userId","fullName","clubName",city,role,"fftNumber",phone,status,"decidedAt")
     SELECT 'req_' || u.id || '_' || extract(epoch from clock_timestamp())::bigint::text, u.id, u."displayName", 'Club', 'Ville', 'Président', '0000', '0600000000', 'APPROVED', now()
     FROM "User" u
     WHERE NOT EXISTS (SELECT 1 FROM "ClubCreationRequest" r WHERE r."userId" = u.id AND r.status = 'APPROVED' AND r."clubId" IS NULL)`,
  );
  await c.end();
}

/** Insère au ledger les bonus de connexion des `days` derniers jours (hier, avant-hier…), comme si le compte s'était connecté chaque jour. */
export async function seedLoginStreak(displayName: string, days: number) {
  const c = new Client({ connectionString: parse(readFileSync(".env.test")).DATABASE_URL });
  await c.connect();
  const u = await c.query(`SELECT id FROM "User" WHERE "displayName" = $1`, [displayName]);
  const id = u.rows[0].id as string;
  for (let i = 1; i <= days; i++) {
    const d = await c.query(`SELECT to_char((now() AT TIME ZONE 'Europe/Paris')::date - $1::int, 'YYYY-MM-DD') AS d`, [i]);
    await c.query(
      `INSERT INTO "LedgerEntry"(id,"userId",type,amount,"idempotencyKey") VALUES ($1,$2,'DAILY_LOGIN_BONUS',10,$3)`,
      [`seed_${id}_${i}`, id, `daily:${id}:${d.rows[0].d}`],
    );
  }
  await c.end();
}

/** Lance le vrai script `npm run seed:demo` contre la base de TEST (mots de passe à coût réduit, comme le reste des E2E). */
export function seedDemoOnTestDb(): string {
  const env = parse(readFileSync(".env.test"));
  return execFileSync("npx", ["tsx", "scripts/seed-demo.ts"], {
    env: { ...process.env, ...env, BCRYPT_ROUNDS: "4" },
    encoding: "utf8",
    timeout: 240_000,
  });
}

/** Requête SQL directe sur la base de TEST (lecture des identifiants créés par le seed). */
export async function queryTestDb<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const c = new Client({ connectionString: parse(readFileSync(".env.test")).DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(sql, params)).rows as T[];
  } finally {
    await c.end();
  }
}

/** Vide la base de TEST (les scénarios suivants créent leurs propres données). */
export async function wipeTestDb() {
  await queryTestDb(
    `TRUNCATE "LedgerEntry","Prediction","Match","EncounterEvent","Encounter","TeamPlayer","Player","Team","ClubMembership","Club","User" CASCADE`,
  );
}

/** Déconnexion : le bouton est sur la page « Mon profil » (touche l'avatar tout à droite de la bannière). */
export async function signOut(page: Page) {
  await page.getByRole("link", { name: "Mon profil" }).click();
  await page.getByRole("button", { name: "Déconnexion" }).click();
}

/** Admin : appuie sur « Révéler le code d'invitation » et renvoie le code affiché. */
export async function revealInviteCode(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Révéler le code d'invitation" }).click();
  return (await page.getByTestId("invite-code").innerText()).trim();
}

/**
 * Ouvre une section repliée de la page du club (« Équipes du club », « Équipes adverses » ou « Membres »)
 * si elle ne l'est pas déjà. Le titre de la section porte un compteur : on le reconnaît à son début.
 */
export async function openSection(page: Page, name: "Équipes du club" | "Équipes adverses" | "Membres") {
  const summary = page.locator("summary").filter({ hasText: new RegExp(`^${name} \\(`) }).first();
  await summary.waitFor();
  const open = await summary.evaluate((el) => (el.parentElement as HTMLDetailsElement).open);
  if (!open) await summary.click();
}
