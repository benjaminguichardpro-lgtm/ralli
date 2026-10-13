import { type Browser, type Page, expect, test } from "@playwright/test";
import { checkPage, queryTestDb, seedDemoOnTestDb, signIn, wipeTestDb } from "./helpers";

// Filtre des rencontres par statut, sur la démo de TC Démo-Lyon (10 rencontres) et de TC Démo-Nantes.
// Lyon : 2 victoires (4 – 1 et 2 – 1), 1 défaite (1 – 3), 1 nul (3 – 3), 1 annulée, 1 contestée, 1 score proposé, 1 verrouillée, 1 ouverte, 1 brouillon.

test.describe.configure({ mode: "serial" });

const PASSWORD = "demo-ralli-2026";
let lyon: string, nantes: string;
let admin: Page, membre: Page;

const newPage = async (b: Browser) => (await b.newContext()).newPage();
const rows = (p: Page) => p.getByTestId("encounter-list").first().locator("li");
const chip = (p: Page, key: string) => p.getByTestId(`filter-${key}`);

async function login(b: Browser, pseudo: string): Promise<Page> {
  const page = await newPage(b);
  await signIn(page, pseudo, PASSWORD, pseudo);
  await expect(page.getByTestId("nav-user")).toHaveText(pseudo);
  const popup = page.getByTestId("daily-bonus");
  if (await popup.isVisible().catch(() => false)) await popup.getByRole("button", { name: "Super" }).click();
  return page;
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000);
  await wipeTestDb();
  seedDemoOnTestDb();
  lyon = (await queryTestDb<{ id: string }>(`SELECT id FROM "Club" WHERE name = 'TC Démo-Lyon'`))[0]!.id;
  nantes = (await queryTestDb<{ id: string }>(`SELECT id FROM "Club" WHERE name = 'TC Démo-Nantes'`))[0]!.id;
  admin = await login(browser, "admin_lyon");
  membre = await login(browser, "parieur1");
});

test.afterAll(async () => {
  await wipeTestDb();
});

test("les puces et leurs compteurs (admin : brouillon compris)", async () => {
  await admin.goto(`/clubs/${lyon}`);
  const expected: [string, string][] = [
    ["toutes", "Toutes 10"],
    ["a-venir", "À venir 2"],
    ["en-cours", "En cours 3"],
    ["terminees", "Terminées 4"],
    ["victoires", "Victoires 2"],
    ["defaites", "Défaites 1"],
    ["nuls", "Nuls 1"],
    ["annulees", "Annulées 1"],
  ];
  for (const [key, text] of expected) await expect(chip(admin, key)).toHaveText(text);
  await expect(chip(admin, "toutes")).toHaveAttribute("aria-current", "true");
  await expect(rows(admin)).toHaveCount(10);
  await checkPage(admin, "110-filtres-toutes");
});

test("badges de résultat sur les rencontres terminées : le club en premier, victoire, défaite, nul", async () => {
  const badges = await admin.getByTestId("encounter-list").first().getByTestId("result-badge").allInnerTexts();
  // Le score proposé (pas encore confirmé) porte un badge « Provisoire », ni victoire ni défaite.
  expect(badges.filter((b) => !b.startsWith("Provisoire")).sort()).toEqual(["Défaite 1 – 3", "Nul 3 – 3", "Victoire 2 – 1", "Victoire 4 – 1"]);
  const provisional = badges.filter((b) => b.startsWith("Provisoire"));
  expect(provisional).toHaveLength(1);
  expect(provisional[0]).toMatch(/^Provisoire \d+ – \d+$/);
  // Les autres statuts gardent leur badge habituel.
  await expect(rows(admin).filter({ hasText: "Annulée" })).toHaveCount(1);
  await expect(rows(admin).filter({ hasText: "Score contesté" })).toHaveCount(1);
  await expect(rows(admin).filter({ hasText: "Terminée" })).toHaveCount(0); // « Terminée » est remplacé par le résultat
});

test("« Victoires » : deux rencontres, le choix reste dans l'adresse et la puce est marquée", async () => {
  await chip(admin, "victoires").click();
  await expect(admin).toHaveURL(/\?statut=victoires$/);
  await expect(chip(admin, "victoires")).toHaveAttribute("aria-current", "true");
  await expect(chip(admin, "toutes")).not.toHaveAttribute("aria-current", "true");
  await expect(rows(admin)).toHaveCount(2);
  await expect(rows(admin).getByTestId("result-badge")).toHaveText(["Victoire 2 – 1", "Victoire 4 – 1"]);
  await checkPage(admin, "111-filtre-victoires");
  // Rechargement et retour arrière : le filtre est dans l'adresse.
  await admin.reload();
  await expect(rows(admin)).toHaveCount(2);
});

test("« Défaites » et « Nuls » : une rencontre chacune, avec le score du club en premier", async () => {
  await chip(admin, "defaites").click();
  await expect(rows(admin)).toHaveCount(1);
  await expect(rows(admin).first()).toContainText("Défaite 1 – 3");
  await chip(admin, "nuls").click();
  await expect(rows(admin)).toHaveCount(1);
  await expect(rows(admin).first()).toContainText("Nul 3 – 3");
});

test("« Terminées », « En cours », « À venir », « Annulées »", async () => {
  await chip(admin, "terminees").click();
  await expect(rows(admin)).toHaveCount(4);
  await chip(admin, "en-cours").click();
  await expect(rows(admin)).toHaveCount(3);
  for (const label of ["Pronostics fermés", "Provisoire", "Score contesté"]) await expect(rows(admin).filter({ hasText: label })).toHaveCount(1);
  await chip(admin, "a-venir").click();
  await expect(rows(admin)).toHaveCount(2);
  await expect(rows(admin).filter({ hasText: "Brouillon" })).toHaveCount(1);
  await expect(rows(admin).filter({ hasText: "Pronostics ouverts" })).toHaveCount(1);
  await chip(admin, "annulees").click();
  await expect(rows(admin)).toHaveCount(1);
  await expect(rows(admin).first()).toContainText("Annulée");
  await checkPage(admin, "112-filtre-annulees");
});

test("un simple membre : pas de brouillon dans les compteurs ; la croix d'archivage reste réservée au staff", async () => {
  await membre.goto(`/clubs/${lyon}`);
  await expect(chip(membre, "toutes")).toHaveText("Toutes 9");
  await expect(chip(membre, "a-venir")).toHaveText("À venir 1");
  await expect(membre.getByTestId("archive-encounter")).toHaveCount(0);
  await chip(membre, "terminees").click();
  await expect(rows(membre)).toHaveCount(4);
});

test("filtre vide : message ; paramètre inconnu : comme « Toutes » ; chaque club a ses propres compteurs", async () => {
  await membre.goto(`/clubs/${nantes}?statut=defaites`); // Nantes n'a ni défaite ni nul
  await expect(chip(membre, "defaites")).toHaveText("Défaites 0");
  await expect(membre.getByText("Aucune rencontre dans cette catégorie.")).toBeVisible();
  await expect(rows(membre)).toHaveCount(0);
  await membre.goto(`/clubs/${nantes}?statut=victoires`);
  await expect(rows(membre)).toHaveCount(1);
  await expect(rows(membre).first()).toContainText("Victoire 3 – 1");

  await membre.goto(`/clubs/${lyon}?statut=n-importe-quoi`);
  await expect(chip(membre, "toutes")).toHaveAttribute("aria-current", "true");
  await expect(rows(membre)).toHaveCount(9);
});

test("archiver une victoire : elle sort de la liste et des compteurs, et garde son badge dans les archives", async () => {
  await admin.goto(`/clubs/${lyon}?statut=victoires`);
  admin.once("dialog", (d) => void d.accept());
  await rows(admin).first().getByTestId("archive-encounter").click();
  await expect(chip(admin, "victoires")).toHaveText("Victoires 1");
  await expect(chip(admin, "terminees")).toHaveText("Terminées 3");
  await expect(chip(admin, "toutes")).toHaveText("Toutes 9");
  const archives = admin.getByTestId("archives");
  await archives.locator("summary").click();
  await expect(archives.getByTestId("result-badge")).toHaveText(/^Victoire \d – \d$/);
});
