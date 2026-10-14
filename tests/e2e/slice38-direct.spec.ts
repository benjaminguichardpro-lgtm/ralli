import { type Browser, type Page, expect, test } from "@playwright/test";
import { checkPage, queryTestDb, seedDemoOnTestDb, signIn, wipeTestDb } from "./helpers";

// Saisie en direct : le résultat de chaque match est saisi dès qu'il est terminé ; le score se met à jour partout, visible sans compte.
// Charge la vraie démo : admin_lyon administre TC Démo-Lyon, parieur1 en est simple membre. On fait « commencer » une rencontre ouverte.

test.describe.configure({ mode: "serial" });

const PASSWORD = "demo-ralli-2026";
let encId: string;
let lyonId: string;
let matchIds: string[];

async function login(b: Browser, pseudo: string): Promise<Page> {
  const p = await (await b.newContext()).newPage();
  p.on("dialog", (d) => void d.accept());
  await signIn(p, pseudo, PASSWORD, pseudo);
  await expect(p.getByTestId("nav-user")).toHaveText(pseudo);
  const recap = p.getByTestId("results-recap");
  const popup = p.getByTestId("daily-bonus");
  for (let i = 0; i < 3; i++) {
    const which = await Promise.race([recap.waitFor({ timeout: 8000 }).then(() => "recap" as const), popup.waitFor({ timeout: 8000 }).then(() => "bonus" as const)]).catch(() => null);
    if (which === "recap") await p.keyboard.press("Escape");
    else if (which === "bonus") await popup.getByRole("button", { name: "Super" }).click();
    else break;
    await expect(which === "recap" ? recap : popup).toBeHidden();
  }
  return p;
}

test.beforeAll(async () => {
  test.setTimeout(300_000);
  await wipeTestDb();
  seedDemoOnTestDb();
  lyonId = (await queryTestDb<{ id: string }>(`SELECT id FROM "Club" WHERE name = 'TC Démo-Lyon'`))[0]!.id;
  // Une rencontre ouverte de Lyon avec au moins 2 matchs : elle « commence » (pronostics fermés, pas de score proposé).
  const rows = await queryTestDb<{ id: string }>(
    `SELECT e.id FROM "Encounter" e WHERE e."organizerClubId" = '${lyonId}' AND e.status = 'OPEN' AND e."startsAt" > now() AND e."archivedAt" IS NULL
       AND (SELECT count(*) FROM "Match" m WHERE m."encounterId" = e.id AND m."voidedAt" IS NULL) >= 2 ORDER BY e."startsAt" LIMIT 1`,
  );
  encId = rows[0]!.id;
  await queryTestDb(`UPDATE "Encounter" SET "startsAt" = now() - interval '1 hour', "predictionsCloseAt" = now() - interval '1 hour' WHERE id = '${encId}'`);
  matchIds = (await queryTestDb<{ id: string }>(`SELECT id FROM "Match" WHERE "encounterId" = '${encId}' AND "voidedAt" IS NULL ORDER BY kind, "order"`)).map((r) => r.id);
});
test.afterAll(wipeTestDb);

test("rencontre reportée (pronostics restés fermés) : pas de saisie avant la nouvelle heure de début", async ({ browser }) => {
  // Pronostics fermés depuis une heure, mais début dans deux heures : c'est l'état d'une rencontre reportée après la fermeture.
  await queryTestDb(`UPDATE "Encounter" SET "startsAt" = now() + interval '2 hours', "predictionsCloseAt" = now() - interval '1 hour' WHERE id = '${encId}'`);
  const p = await login(browser, "admin_lyon");
  await p.goto(`/rencontres/${encId}`);
  await expect(p.getByText("Rencontre reportée : les pronostics sont restés fermés.")).toBeVisible();
  await expect(p.getByTestId("live-not-started")).toBeVisible();
  await expect(p.getByTestId("live-open")).toHaveCount(0);
  await expect(p.getByTestId("propose-score")).toHaveCount(0);
  await p.context().close();
  // Retour à une rencontre commencée pour les scénarios suivants.
  await queryTestDb(`UPDATE "Encounter" SET "startsAt" = now() - interval '1 hour', "predictionsCloseAt" = now() - interval '1 hour' WHERE id = '${encId}'`);
});

test("l'admin saisit les matchs un par un : le score s'affiche « en direct » et se corrige", async ({ browser }) => {
  test.setTimeout(300_000); // plusieurs enregistrements à la suite
  const p = await login(browser, "admin_lyon");
  await p.goto(`/rencontres/${encId}`);
  await expect(p.getByTestId("live-hint")).toBeVisible();
  await expect(p.getByTestId("tally")).toHaveCount(0); // rien de saisi : pas de score
  await checkPage(p, "direct-avant-saisie");

  // Premier match : victoire du domicile.
  const first = p.getByTestId(`live-form-${matchIds[0]}`);
  await first.getByTestId("live-open").click();
  await first.getByLabel("Vainqueur").selectOption("HOME");
  await first.getByRole("button", { name: "Enregistrer le résultat" }).click();
  await expect(p.getByTestId("tally")).toContainText("Score en direct");
  await expect(p.getByTestId("tally")).toContainText("1 – 0");
  await expect(p.getByTestId("live-note")).toBeVisible();
  // Le score en direct est mis en évidence tout en haut, juste sous l'encart du titre et avant la liste des matchs.
  const [banner, matchesTitle] = [await p.getByTestId("tally").boundingBox(), await p.getByRole("heading", { name: "Matchs", exact: true }).boundingBox()];
  expect(banner!.y).toBeLessThan(matchesTitle!.y);
  expect(banner!.y).toBeLessThan(450);
  await checkPage(p, "direct-un-match");

  // Deuxième match : victoire de l'extérieur, le score évolue.
  const second = p.getByTestId(`live-form-${matchIds[1]}`);
  await second.getByTestId("live-open").click();
  await second.getByLabel("Vainqueur").selectOption("AWAY");
  await second.getByRole("button", { name: "Enregistrer le résultat" }).click();
  await expect(p.getByTestId("tally")).toContainText("1 – 1");

  // Correction du premier match : victoire de l'extérieur, puis effacement.
  await first.getByTestId("live-open").click();
  await first.getByLabel("Vainqueur").selectOption("AWAY");
  await first.getByRole("button", { name: "Enregistrer le résultat" }).click();
  await expect(p.getByTestId("tally")).toContainText("0 – 2");
  await first.getByRole("button", { name: "Effacer le résultat" }).click();
  await expect(p.getByTestId("tally")).toContainText("0 – 1");
  // On remet 1 – 1 pour la suite.
  await first.getByTestId("live-open").click();
  await first.getByLabel("Vainqueur").selectOption("HOME");
  await first.getByRole("button", { name: "Enregistrer le résultat" }).click();
  await expect(p.getByTestId("tally")).toContainText("1 – 1");
  // Aucun pronostic n'a été réglé : ils restent en cours tant que le score final n'est pas confirmé.
  expect((await queryTestDb(`SELECT 1 FROM "Prediction" pr JOIN "Match" m ON m.id = pr."matchId" WHERE m."encounterId" = '${encId}' AND pr.status <> 'PENDING'`)).length).toBe(0);
  await p.context().close();
});

test("un visiteur sans compte voit le score en direct, sans aucun formulaire de saisie", async ({ page }) => {
  await page.goto(`/rencontres/${encId}`);
  await expect(page.getByTestId("tally")).toContainText("Score en direct");
  await expect(page.getByTestId("tally")).toContainText("1 – 1");
  await expect(page.getByTestId("live-open")).toHaveCount(0);
  await expect(page.getByTestId("live-hint")).toHaveCount(0);
  await checkPage(page, "direct-visiteur");
});

test("un membre voit « En direct » sur l'accueil et sur la page du club, sans pouvoir saisir", async ({ browser }) => {
  const p = await login(browser, "parieur1");
  await p.goto("/");
  await expect(p.getByTestId("live-score").first()).toHaveText("En direct 1 – 1");
  await p.goto(`/clubs/${lyonId}`);
  await expect(p.getByTestId("result-badge").filter({ hasText: "En direct 1 – 1" })).toBeVisible();
  await p.goto(`/rencontres/${encId}`);
  await expect(p.getByTestId("tally")).toContainText("1 – 1");
  await expect(p.getByTestId("live-open")).toHaveCount(0);
  await p.context().close();
});

test("le même score apparaît sur la page publique du club", async ({ browser, page }) => {
  const admin = await login(browser, "admin_lyon");
  await admin.goto(`/clubs/${lyonId}/fiche`);
  await admin.getByRole("button", { name: "Activer la page publique" }).click();
  await expect(admin.getByTestId("public-page-link")).toBeVisible();
  await admin.context().close();
  await page.goto("/c/tc-demo-lyon");
  await expect(page.getByTestId("public-upcoming").getByTestId("result-badge").filter({ hasText: "En direct 1 – 1" })).toBeVisible();
});
