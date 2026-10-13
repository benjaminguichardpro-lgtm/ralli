import { type Browser, type Page, expect, test } from "@playwright/test";
import { checkPage, queryTestDb, seedDemoOnTestDb, signIn, wipeTestDb } from "./helpers";

// Page publique d'un club (/c/<adresse>) : activée par un admin depuis la fiche, lisible sans compte, introuvable sinon.
// Charge la vraie démo : admin_lyon administre TC Démo-Lyon, parieur1 en est simple membre.

test.describe.configure({ mode: "serial" });

const PASSWORD = "demo-ralli-2026";
let lyonId: string;

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
  // Une description : elle ne doit jamais apparaître sur la page publique.
  await queryTestDb(`UPDATE "Club" SET description = 'Description réservée aux membres' WHERE id = '${lyonId}'`);
});
test.afterAll(wipeTestDb);

test("désactivée au départ : l'adresse du club est introuvable, même pour un visiteur", async ({ page }) => {
  await page.goto("/c/tc-demo-lyon");
  await expect(page.getByRole("heading", { name: "Page introuvable" })).toBeVisible();
  await expect(page.getByTestId("public-club")).toHaveCount(0);
});

test("un membre simple ne voit pas le réglage ; l'admin l'active et reçoit le lien", async ({ browser }) => {
  const member = await login(browser, "parieur1");
  await member.goto(`/clubs/${lyonId}/fiche`);
  await expect(member.getByRole("heading", { name: "Fiche du club" }).or(member.getByText("Fiche du club"))).toBeVisible();
  await expect(member.getByTestId("public-page-panel")).toHaveCount(0);
  await member.context().close();

  const admin = await login(browser, "admin_lyon");
  await admin.goto(`/clubs/${lyonId}/fiche`);
  const panel = admin.getByTestId("public-page-panel");
  await expect(panel).toContainText("Désactivée");
  await checkPage(admin, "fiche-page-publique-off");
  await panel.getByRole("button", { name: "Activer la page publique" }).click();
  await expect(panel.getByTestId("public-page-link")).toContainText("/c/tc-demo-lyon");
  await expect(panel.getByRole("link", { name: "Partager la page" })).toBeVisible();
  // « Copier le lien » met l'adresse complète dans le presse-papiers.
  await admin.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await panel.getByTestId("copy-link").click();
  await expect(panel.getByTestId("copy-link")).toContainText("Lien copié");
  expect(await admin.evaluate(() => navigator.clipboard.readText())).toMatch(/^https?:\/\/[^/]+\/c\/tc-demo-lyon$/);
  await checkPage(admin, "fiche-page-publique-on");
  // Le même bouton est à côté de « Voir la fiche du club » sur la page du club (admins seulement, page publique active).
  await admin.goto(`/clubs/${lyonId}`);
  await expect(admin.getByTestId("club-header").getByTestId("copy-link")).toBeVisible();
  await admin.context().close();
});

test("un visiteur sans compte voit résultats, rencontres et équipes, sans description ni membres", async ({ page }) => {
  await page.goto("/c/tc-demo-lyon");
  await expect(page.getByTestId("public-club-name")).toHaveText("TC Démo-Lyon");
  await expect(page).toHaveTitle(/TC Démo-Lyon/);
  await expect(page.getByTestId("public-club-facts")).toContainText("250 licenciés");
  await expect(page.getByTestId("public-results").getByTestId("encounter-list")).toBeVisible();
  await expect(page.getByTestId("public-upcoming")).toBeVisible();
  await expect(page.getByTestId("public-teams")).toContainText("Messieurs 1");
  await expect(page.locator("body")).not.toContainText("Description réservée aux membres");
  await expect(page.locator("body")).not.toContainText("parieur1");
  await checkPage(page, "page-publique-club");
  // Le logo d'un club public se charge sans compte (ici : pastille d'initiales ou image).
  await expect(page.getByTestId("club-logo").or(page.getByTestId("club-logo-initials"))).toBeVisible();
  // Appel à l'action : s'inscrire.
  await page.getByTestId("public-club-cta").click();
  await expect(page).toHaveURL(/\/inscription/);
});

test("un résultat de la page publique mène à la rencontre, lisible sans compte", async ({ page }) => {
  await page.goto("/c/tc-demo-lyon");
  await page.getByTestId("public-results").getByTestId("encounter-list").getByRole("link").first().click();
  await expect(page).toHaveURL(/\/rencontres\//);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("un compte connecté voit « Voir le club dans Ralli » au lieu de l'inscription", async ({ browser }) => {
  const p = await login(browser, "parieur1");
  await p.goto("/c/tc-demo-lyon");
  await expect(p.getByTestId("public-club-cta")).toHaveText("Voir le club dans Ralli");
  await p.getByTestId("public-club-cta").click();
  await expect(p).toHaveURL(new RegExp(`/clubs/${lyonId}$`));
  // Page publique active, mais « Copier le lien » est réservé aux admins.
  await expect(p.getByTestId("club-header")).toBeVisible();
  await expect(p.getByTestId("copy-link")).toHaveCount(0);
  await p.context().close();
});

test("l'admin change l'adresse (une adresse prise est refusée), puis désactive : le lien ne marche plus", async ({ browser }) => {
  const admin = await login(browser, "admin_lyon");
  await admin.goto(`/clubs/${lyonId}/fiche`);
  const panel = admin.getByTestId("public-page-panel");
  await panel.getByLabel("Adresse de la page").fill("Mauvaise Adresse!");
  await panel.getByRole("button", { name: "Enregistrer l'adresse" }).click();
  await expect(panel).toContainText("chiffres et tirets seulement");
  await panel.getByLabel("Adresse de la page").fill("tennis-lyon-7");
  await panel.getByRole("button", { name: "Enregistrer l'adresse" }).click();
  await expect(panel.getByTestId("public-page-link")).toContainText("/c/tennis-lyon-7");

  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto("/c/tennis-lyon-7");
  await expect(visitor.getByTestId("public-club-name")).toHaveText("TC Démo-Lyon");
  await visitor.goto("/c/tc-demo-lyon");
  await expect(visitor.getByRole("heading", { name: "Page introuvable" })).toBeVisible();

  await panel.getByRole("button", { name: "Désactiver" }).click();
  await expect(panel).toContainText("Désactivée");
  await visitor.goto("/c/tennis-lyon-7");
  await expect(visitor.getByRole("heading", { name: "Page introuvable" })).toBeVisible();
  await visitor.context().close();
  await admin.context().close();
});
