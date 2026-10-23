import { type Browser, type Page, expect, test } from "@playwright/test";
import { checkPage, queryTestDb, seedDemoOnTestDb, signIn, wipeTestDb } from "./helpers";

// Carte des clubs : aperçu sur la page « Clubs », carte agrandie, épingles et fenêtres, filtres région / taille / rencontre à venir.
// Charge la vraie démo ; la position, la région et les licenciés des trois clubs sont posés en base (aucun appel à l'API adresse).

test.describe.configure({ mode: "serial" });

const PASSWORD = "Demo-ralli-2026!";
let lyonId: string;
let page: Page;

async function login(b: Browser, pseudo: string): Promise<Page> {
  const p = await (await b.newContext()).newPage();
  p.on("dialog", (d) => void d.accept());
  await signIn(p, pseudo, PASSWORD, pseudo);
  await expect(p.getByTestId("nav-user")).toHaveText(pseudo);
  const popup = p.getByTestId("daily-bonus");
  if (await popup.waitFor({ timeout: 5000 }).then(() => true, () => false)) await popup.getByRole("button", { name: "Super" }).click();
  await expect(popup).toBeHidden();
  return p;
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000);
  seedDemoOnTestDb();
  lyonId = (await queryTestDb<{ id: string }>(`SELECT id FROM "Club" WHERE name = 'TC Démo-Lyon'`))[0]!.id;
  await queryTestDb(`UPDATE "Club" SET latitude = 45.75, longitude = 4.85, region = 'Auvergne-Rhône-Alpes', "licenseeCount" = 250 WHERE name = 'TC Démo-Lyon'`);
  await queryTestDb(`UPDATE "Club" SET latitude = 47.22, longitude = -1.55, region = 'Pays de la Loire', "licenseeCount" = 80 WHERE name = 'TC Démo-Nantes'`);
  await queryTestDb(`UPDATE "Club" SET latitude = NULL, longitude = NULL, region = 'Nouvelle-Aquitaine', "licenseeCount" = 400 WHERE name = 'TC Démo-Bordeaux'`);
  page = await login(browser, "admin_bordeaux");
});
test.afterAll(async () => {
  await page.context().close();
  await wipeTestDb();
});

test("la page Clubs montre un aperçu de la carte ; le toucher l'agrandit", async () => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Navigation principale" }).getByRole("link", { name: "Clubs" }).click();
  await expect(page.getByTestId("club-map-preview")).toBeVisible();
  await expect(page.getByTestId("map-preview-link")).toContainText("2 clubs localisés");
  await checkPage(page, "carte-apercu");
  await page.getByTestId("map-preview-link").click();
  await expect(page).toHaveURL(/\/clubs\/carte$/);
  await expect(page.getByRole("heading", { name: "Carte des clubs" })).toBeVisible();
  await expect(page.getByTestId("club-map")).toBeVisible();
  await expect(page.getByTestId("map-count")).toHaveText("2 clubs sur la carte · 1 sans adresse localisée (visible dans la liste)");
  await checkPage(page, "carte-agrandie");
});

test("une épingle ouvre une fenêtre avec le nom, la ville, le compteur et le lien vers le club", async () => {
  await page.goto("/clubs/carte");
  const pin = page.locator('.leaflet-marker-icon[title="TC Démo-Lyon"]');
  await expect(pin).toBeVisible();
  await pin.click();
  const link = page.getByTestId("map-popup-link");
  await expect(link).toHaveText("TC Démo-Lyon");
  await expect(page.locator(".leaflet-popup")).toContainText("personne");
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/clubs/${lyonId}$`));
});

test("la liste suit les filtres de l'adresse, et l'aperçu les garde en ouvrant la carte", async () => {
  await page.goto("/clubs/recherche?region=Pays+de+la+Loire");
  await expect(page.getByTestId("club-filters")).toHaveCount(0); // les filtres ne se règlent que sur la carte
  await expect(page.getByTestId("club-result")).toHaveCount(1);
  await expect(page.getByTestId("club-result").first()).toContainText("TC Démo-Nantes");
  await expect(page.getByTestId("map-preview-link")).toContainText("1 club localisé");
  await page.getByTestId("map-preview-link").click();
  await expect(page).toHaveURL(/\/clubs\/carte\?region=Pays\+de\+la\+Loire/);
  await expect(page.getByTestId("map-count")).toHaveText("1 club sur la carte");
  await expect(page.locator('.leaflet-marker-icon[title="TC Démo-Lyon"]')).toHaveCount(0);
});

test("filtres intégrés en haut de la carte : ils s'appliquent tout de suite et se cumulent", async () => {
  await page.goto("/clubs/carte");
  const filters = page.getByTestId("map-filters");
  await expect(filters).toBeVisible();
  await expect(page.getByTestId("map-count")).toContainText("2 clubs sur la carte");
  await filters.getByLabel("Région").selectOption("Pays de la Loire");
  await expect(page).toHaveURL(/\/clubs\/carte\?region=Pays\+de\+la\+Loire$/);
  await expect(page.getByTestId("map-count")).toHaveText("1 club sur la carte");
  await expect(page.locator('.leaflet-marker-icon[title="TC Démo-Nantes"]')).toBeVisible();
  await filters.getByLabel("Taille du club").selectOption("large"); // Nantes est petit : plus rien
  await expect(page.getByTestId("map-count")).toHaveText("0 club sur la carte");
  await filters.getByRole("button", { name: "Effacer" }).click();
  await expect(page).toHaveURL(/\/clubs\/carte$/);
  await expect(page.getByTestId("map-count")).toContainText("2 clubs sur la carte");
  await filters.getByRole("button", { name: "Rencontre à venir" }).click();
  await expect(page).toHaveURL(/avenir=1/);
  await expect(filters.getByRole("button", { name: "Rencontre à venir" })).toHaveAttribute("aria-pressed", "true");
  await checkPage(page, "carte-filtres");
});

test("filtre par taille : petit, moyen, grand ; un club sans licenciés renseignés n'est dans aucune taille", async () => {
  const names = async (taille: string) => {
    await page.goto(`/clubs/recherche?taille=${taille}`);
    return page.getByTestId("club-result").locator("span.truncate.font-serif").allTextContents();
  };
  expect(await names("small")).toEqual(["TC Démo-Nantes"]);
  expect(await names("medium")).toEqual(["TC Démo-Lyon"]);
  expect(await names("large")).toEqual(["TC Démo-Bordeaux"]);
  await queryTestDb(`UPDATE "Club" SET "licenseeCount" = NULL WHERE name = 'TC Démo-Bordeaux'`);
  expect(await names("large")).toEqual([]);
  await queryTestDb(`UPDATE "Club" SET "licenseeCount" = 400 WHERE name = 'TC Démo-Bordeaux'`);
});

test("filtre « rencontre à venir » : seuls les clubs avec une rencontre publiée qui n'a pas commencé", async () => {
  const expected = (
    await queryTestDb<{ name: string }>(
      `SELECT DISTINCT c.name FROM "Club" c JOIN "Encounter" e ON e."organizerClubId" = c.id WHERE e.status = 'OPEN' AND e."archivedAt" IS NULL AND e."startsAt" > now() ORDER BY c.name`,
    )
  ).map((r) => r.name);
  expect(expected.length).toBeGreaterThan(0);
  await page.goto("/clubs/recherche?avenir=1");
  const shown = (await page.getByTestId("club-result").locator("span.truncate.font-serif").allTextContents()).sort();
  expect(shown).toEqual(expected);
  // Un club sans rencontre à venir disparaît ; rendre la rencontre non publiée le retire du filtre.
  await queryTestDb(`UPDATE "Encounter" SET status = 'CANCELLED' WHERE status = 'OPEN'`);
  await page.goto("/clubs/recherche?avenir=1");
  await expect(page.getByTestId("club-result")).toHaveCount(0);
  await expect(page.getByText("Aucun club ne correspond à cette recherche.")).toBeVisible();
});

test("« Effacer » sur la carte remet tous les clubs, et le retour à la liste les montre tous", async () => {
  await page.goto("/clubs/carte?region=Bretagne");
  await expect(page.getByTestId("map-count")).toHaveText("0 club sur la carte");
  await page.getByTestId("map-filters").getByRole("button", { name: "Effacer" }).click();
  await expect(page).toHaveURL(/\/clubs\/carte$/);
  await expect(page.getByTestId("map-count")).toContainText("2 clubs sur la carte");
  await page.getByTestId("map-back").click();
  await expect(page).toHaveURL(/\/clubs\/recherche$/);
  await expect(page.getByTestId("club-result")).toHaveCount(3);
});
