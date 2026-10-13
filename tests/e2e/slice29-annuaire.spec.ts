import { type Browser, type Page, expect, test } from "@playwright/test";
import { checkPage, queryTestDb, seedDemoOnTestDb, signIn, wipeTestDb } from "./helpers";

// Annuaire des clubs : recherche (accueil, onglet « Clubs »), page d'un club pour un non-membre, « Rejoindre » et « Quitter ».
// Charge la vraie démo ; le visiteur est admin_bordeaux (admin du club vide TC Démo-Bordeaux, membre d'aucun autre club).

test.describe.configure({ mode: "serial" });

const PASSWORD = "demo-ralli-2026";
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

const followers = async (clubId: string) => Number((await queryTestDb<{ n: string }>(`SELECT count(*)::text AS n FROM "ClubMembership" WHERE "clubId" = $1`, [clubId]))[0]!.n);
const label = (n: number) => (n === 1 ? "1 personne suit ce club" : `${n} personnes suivent ce club`);

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000);
  seedDemoOnTestDb();
  lyonId = (await queryTestDb<{ id: string }>(`SELECT id FROM "Club" WHERE name = 'TC Démo-Lyon'`))[0]!.id;
  page = await login(browser, "admin_bordeaux");
});
test.afterAll(async () => {
  await page.context().close();
  await wipeTestDb();
});

test("la barre de recherche de l'accueil mène aux résultats : par nom, sans accent ni majuscule", async () => {
  await page.goto("/");
  await page.getByRole("searchbox", { name: "Rechercher un club" }).fill("DEMO lyon");
  await page.getByRole("button", { name: "Chercher" }).click();
  await expect(page).toHaveURL(/\/clubs\/recherche\?q=DEMO\+lyon$/);
  const results = page.getByTestId("club-result");
  await expect(results).toHaveCount(1);
  await expect(results.first()).toContainText("TC Démo-Lyon");
  await expect(results.first().getByTestId("club-followers")).toHaveText(label(await followers(lyonId)));
  await expect(page.getByTestId("club-count")).toHaveText("1 club trouvé");
  await checkPage(page, "annuaire-recherche");
});

test("aucun résultat : message clair ; sans recherche : tous les clubs, les plus suivis d'abord", async () => {
  await page.goto("/clubs/recherche?q=zzzz");
  await expect(page.getByText("Aucun club ne correspond à cette recherche.")).toBeVisible();
  await page.goto("/clubs/recherche");
  const names = page.getByTestId("club-result").locator("span.truncate.font-serif");
  await expect(names).toHaveText(["TC Démo-Lyon", "TC Démo-Nantes", "TC Démo-Bordeaux"]);
  await expect(page.getByTestId("club-result").filter({ hasText: "TC Démo-Bordeaux" })).toContainText("Admin de ce club");
  await expect(page.getByTestId("club-result").filter({ hasText: "TC Démo-Lyon" })).not.toContainText(/Membre|Admin de ce club/);
});

test("l'onglet « Clubs » ouvre la recherche", async () => {
  await page.goto("/");
  await page.getByRole("navigation", { name: "Navigation principale" }).getByRole("link", { name: "Clubs" }).click();
  await expect(page.getByRole("heading", { name: "Rechercher un club" })).toBeVisible();
});

test("non-membre : page du club en lecture seule avec compteur, rencontres à venir et bouton Rejoindre", async () => {
  await page.goto("/clubs/recherche?q=lyon");
  await page.getByTestId("club-result").first().click();
  await expect(page).toHaveURL(new RegExp(`/clubs/${lyonId}$`));
  const v = page.getByTestId("visitor-club");
  await expect(v).toBeVisible();
  await expect(v.getByRole("heading", { name: "TC Démo-Lyon" })).toBeVisible();
  await expect(v.getByTestId("club-followers")).toHaveText(label(await followers(lyonId)));
  await expect(v.getByRole("button", { name: "Rejoindre le club" })).toBeVisible();
  await expect(v.getByTestId("visitor-upcoming").getByTestId("encounter-list").getByRole("link").first()).toBeVisible();
  await expect(v.getByTestId("visitor-recent")).toBeVisible();
  // Rien de réservé aux membres.
  await expect(page.getByTestId("section-members")).toHaveCount(0);
  await expect(page.getByTestId("club-top3")).toHaveCount(0);
  await checkPage(page, "annuaire-club-visiteur");
});

test("une rencontre du club : matchs et cotes visibles, mais il faut rejoindre pour pronostiquer", async () => {
  // Une rencontre ouverte aux pronostics (la démo a aussi une rencontre verrouillée, déjà commencée).
  const open = await queryTestDb<{ id: string }>(`SELECT id FROM "Encounter" WHERE "organizerClubId" = $1 AND status = 'OPEN' AND "startsAt" > now() ORDER BY "startsAt" LIMIT 1`, [lyonId]);
  await page.goto(`/clubs/${lyonId}`);
  await page.getByTestId("visitor-upcoming").locator(`a[href="/rencontres/${open[0]!.id}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/rencontres/${open[0]!.id}$`));
  await expect(page.getByTestId("matches")).toBeVisible();
  await expect(page.getByTestId("odds").first()).toBeVisible();
  await expect(page.getByTestId("join-to-predict")).toBeVisible();
  await expect(page.getByTestId("predict")).toHaveCount(0);
  await expect(page.getByText("Rejoins le club pour pronostiquer.").first()).toBeVisible();
});

test("Rejoindre d'un bouton : le compteur monte, les pronostics s'ouvrent ; Quitter avec confirmation le remet", async () => {
  const before = await followers(lyonId);
  // On rejoint depuis la rencontre ouverte : le bandeau disparaît et les pronostics s'ouvrent.
  await page.getByTestId("join-to-predict").getByRole("button", { name: "Rejoindre le club" }).click();
  await expect(page.getByTestId("join-to-predict")).toHaveCount(0);
  await expect(page.getByTestId("predict").first()).toBeVisible();
  await page.goto(`/clubs/${lyonId}`);
  await expect(page.getByTestId("visitor-club")).toHaveCount(0);
  await expect(page.getByTestId("club-followers")).toHaveText(label(before + 1));
  await expect(page.getByText("Votre rôle : membre")).toBeVisible();
  expect(await followers(lyonId)).toBe(before + 1);
  // Quitter.
  await page.getByTestId("leave-club").getByRole("button", { name: "Quitter le club" }).click();
  await expect(page.getByTestId("visitor-club")).toBeVisible();
  await expect(page.getByTestId("club-followers")).toHaveText(label(before));
  expect(await followers(lyonId)).toBe(before);
});

test("un admin unique ne peut pas quitter son club : message clair", async ({ browser }) => {
  const admin = await login(browser, "admin_lyon");
  await admin.goto(`/clubs/${lyonId}`);
  await admin.getByTestId("leave-club").getByRole("button", { name: "Quitter le club" }).click();
  await expect(admin.getByText("Tu es le seul admin")).toBeVisible();
  await expect(admin.getByText("Votre rôle : admin")).toBeVisible();
  await admin.context().close();
});

test("« Voir mes clubs » dans le profil mène à son club", async () => {
  await page.goto("/profil");
  await page.getByTestId("see-my-clubs").click();
  await expect(page.getByRole("heading", { name: "TC Démo-Bordeaux" })).toBeVisible();
});
