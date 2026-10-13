import { type Browser, type Page, expect, test } from "@playwright/test";
import { checkPage, queryTestDb, seedDemoOnTestDb, signIn, wipeTestDb } from "./helpers";

// Rencontres à proximité : bouton sous la barre de recherche (accueil et recherche de clubs), fenêtre « Où es-tu ? » sans code postal,
// résultats sur l'accueil même, rayon réglable (30 km par défaut), code postal du profil. La démo place ses trois clubs
// (Lyon, Nantes, Bordeaux) sur la carte. Le scénario de la fenêtre interroge le vrai service des communes : sauté hors ligne.

test.describe.configure({ mode: "serial" });

const PASSWORD = "demo-ralli-2026";
let networkOk = false;
let upcoming: { club: string; n: number }[];

async function login(b: Browser, pseudo: string): Promise<Page> {
  const p = await (await b.newContext()).newPage();
  p.on("dialog", (d) => void d.accept());
  await signIn(p, pseudo, PASSWORD, pseudo);
  await expect(p.getByTestId("nav-user")).toHaveText(pseudo);
  // Fenêtres d'accueil, une à la fois (résultats puis bonus du jour) : on ferme ce qui s'ouvre.
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
  networkOk = await fetch("https://geo.api.gouv.fr/communes?codePostal=69003&fields=nom&format=json", { signal: AbortSignal.timeout(6000) }).then((r) => r.ok, () => false);
  await wipeTestDb(); // un fichier lancé juste avant a pu laisser sa démo dans la base de test
  seedDemoOnTestDb();
  upcoming = await queryTestDb<{ club: string; n: number }>(
    `SELECT c.name AS club, count(*)::int AS n FROM "Encounter" e JOIN "Club" c ON c.id = e."organizerClubId"
     WHERE e.status = 'OPEN' AND e."archivedAt" IS NULL AND e."startsAt" > now() AND c.latitude IS NOT NULL GROUP BY c.name ORDER BY c.name`,
  );
  expect(upcoming.length).toBeGreaterThan(0);
  // parieur2 a déjà indiqué sa ville (Lyon) ; parieur1 non.
  await queryTestDb(`UPDATE "User" SET "postalCode" = '69003', commune = 'Lyon', latitude = 45.758, longitude = 4.8351 WHERE "displayName" = 'parieur2'`);
});
test.afterAll(wipeTestDb);

test("sans code postal : le bouton ouvre « Où es-tu ? » ; format invalide refusé, rien d'enregistré", async ({ browser }) => {
  const p = await login(browser, "parieur1");
  await p.goto("/");
  const button = p.getByTestId("nearby-button");
  await expect(button).toHaveText("Voir les rencontres à proximité");
  // Juste sous la barre de recherche.
  const bar = await p.getByRole("searchbox", { name: "Rechercher un club" }).boundingBox();
  const btn = await button.boundingBox();
  expect(btn!.y).toBeGreaterThan(bar!.y + bar!.height - 1);
  expect(btn!.y - (bar!.y + bar!.height)).toBeLessThan(60);
  await checkPage(p, "proximite-bouton");
  await button.click();
  const dialog = p.getByTestId("nearby-dialog");
  await expect(dialog.getByRole("heading", { name: "Où es-tu ?" })).toBeVisible();
  await dialog.getByLabel("Code postal de ta ville").fill("123");
  await dialog.getByRole("button", { name: "Valider" }).click();
  await expect(dialog.getByText("Un code postal a 5 chiffres")).toBeVisible();
  await dialog.getByRole("button", { name: "Annuler" }).click();
  await expect(dialog).toBeHidden();
  const rows = await queryTestDb<{ postalCode: string | null }>(`SELECT "postalCode" FROM "User" WHERE "displayName" = 'parieur1'`);
  expect(rows[0]!.postalCode).toBeNull();
  await p.context().close();
});

test("code postal valide dans la fenêtre : enregistré, puis les rencontres s'affichent sur l'accueil (30 km)", async ({ browser }) => {
  test.skip(!networkOk, "service des communes injoignable");
  const p = await login(browser, "parieur1");
  await p.goto("/");
  await p.getByTestId("nearby-button").click();
  const dialog = p.getByTestId("nearby-dialog");
  await dialog.getByLabel("Code postal de ta ville").fill("99999");
  await dialog.getByRole("button", { name: "Valider" }).click();
  await expect(dialog.getByText("Code postal introuvable")).toBeVisible();
  await dialog.getByLabel("Code postal de ta ville").fill("69003");
  // Le vrai service des communes peut être lent ou indisponible un instant : l'application le dit (« réessaie dans un instant »), on réessaie.
  for (let essai = 0; essai < 3; essai++) {
    await dialog.getByRole("button", { name: "Valider" }).click();
    const reussi = await p.waitForURL(/\/\?proximite=1$/, { timeout: 12_000 }).then(() => true, () => false);
    if (reussi) break;
    await expect(dialog.getByText("réessaie dans un instant")).toBeVisible();
  }
  await expect(p).toHaveURL(/\/\?proximite=1$/);
  await expect(p.getByTestId("nearby-title")).toHaveText("À moins de 30 km de Lyon");
  const rows = await queryTestDb<{ postalCode: string; commune: string; radius: number }>(`SELECT "postalCode", commune, "nearbyRadiusKm" AS radius FROM "User" WHERE "displayName" = 'parieur1'`);
  expect(rows[0]).toEqual({ postalCode: "69003", commune: "Lyon", radius: 30 });
  await p.context().close();
});

test("avec un code postal : accès direct ; les résultats remplacent le fil de l'accueil, avec les distances", async ({ browser }) => {
  const p = await login(browser, "parieur2");
  await p.goto("/");
  await expect(p.getByTestId("feed")).toBeVisible();
  await p.getByTestId("nearby-button").click(); // pas de fenêtre : code déjà connu
  await expect(p).toHaveURL(/\/\?proximite=1$/);
  await expect(p.getByTestId("nearby-dialog")).toHaveCount(0);
  await expect(p.getByTestId("nearby-title")).toHaveText("À moins de 30 km de Lyon");
  await expect(p.getByTestId("feed")).toHaveCount(0);
  const lyon = upcoming.find((u) => u.club === "TC Démo-Lyon")!;
  await expect(p.getByTestId("nearby-encounter")).toHaveCount(lyon.n);
  await expect(p.getByTestId("nearby-encounter").first()).toContainText("TC Démo-Lyon");
  await expect(p.getByTestId("nearby-distance").first()).toHaveText(/^· à (moins de 1|\d+) km$/);
  await expect(p.getByText("TC Démo-Nantes")).toHaveCount(0); // ~ 500 km
  await checkPage(p, "proximite-accueil");
  await p.getByTestId("nearby-home-back").click();
  await expect(p.getByTestId("feed")).toBeVisible();
  await p.context().close();
});

test("rayon réglé au curseur : 1 km (vide), 30 km (Lyon), 60 km (Lyon et Nantes rapproché) ; s'applique tout seul ; gardé pour la prochaine fois", async ({ browser }) => {
  // On rapproche le club de Nantes de Lyon (~ 50 km, vers Saint-Étienne) : le rayon décide alors de sa présence.
  await queryTestDb(`UPDATE "Club" SET latitude = 45.4397, longitude = 4.3872 WHERE name = 'TC Démo-Nantes'`);
  const count = (...clubs: string[]) => upcoming.filter((u) => clubs.includes(u.club)).reduce((sum, u) => sum + u.n, 0);
  const p = await login(browser, "parieur2");
  await p.goto("/?proximite=1");
  const form = p.getByTestId("radius-form");
  const slider = form.getByRole("slider", { name: "Rayon de recherche" });
  await expect(slider).toHaveAttribute("min", "1");
  await expect(slider).toHaveAttribute("max", "200");
  await expect(slider).toHaveValue("30");
  await expect(form.getByTestId("radius-value")).toHaveText("30 km");
  await slider.fill("1"); // pas de bouton « Appliquer » : le rayon s'applique quand le curseur est lâché
  await expect(form.getByTestId("radius-value")).toHaveText("1 km");
  await expect(p.getByTestId("nearby-title")).toHaveText("À moins de 1 km de Lyon");
  await expect(p.getByTestId("nearby-empty")).toContainText("Aucune rencontre à moins de 1 km pour l'instant.");
  await expect(p.getByTestId("nearby-empty").getByRole("link", { name: "Voir la carte des clubs" })).toBeVisible();
  await slider.fill("30");
  await expect(p.getByTestId("nearby-title")).toHaveText("À moins de 30 km de Lyon");
  await expect(p.getByTestId("nearby-encounter")).toHaveCount(count("TC Démo-Lyon"));
  await slider.fill("60");
  await expect(p.getByTestId("nearby-title")).toHaveText("À moins de 60 km de Lyon");
  await expect(p.getByTestId("nearby-encounter")).toHaveCount(count("TC Démo-Lyon", "TC Démo-Nantes"));
  await expect(p.getByTestId("nearby-list")).toContainText("TC Démo-Nantes");
  await checkPage(p, "proximite-curseur");
  // Gardé dans le compte : au rechargement, 60 km.
  await p.goto("/?proximite=1");
  await expect(p.getByTestId("radius-value")).toHaveText("60 km");
  await expect(p.getByTestId("nearby-title")).toHaveText("À moins de 60 km de Lyon");
  const rows = await queryTestDb<{ radius: number }>(`SELECT "nearbyRadiusKm" AS radius FROM "User" WHERE "displayName" = 'parieur2'`);
  expect(rows[0]!.radius).toBe(60);
  await p.context().close();
});

test("sur la recherche de clubs : même bouton, résultats sur une page à part", async ({ browser }) => {
  const p = await login(browser, "parieur2");
  await p.goto("/clubs/recherche");
  const bar = await p.getByRole("searchbox", { name: "Rechercher un club" }).boundingBox();
  const btn = await p.getByTestId("nearby-button").boundingBox();
  expect(btn!.y).toBeGreaterThan(bar!.y);
  await p.getByTestId("nearby-button").click();
  await expect(p).toHaveURL(/\/rencontres\/proximite$/);
  await expect(p.getByRole("heading", { name: "Rencontres à proximité" })).toBeVisible();
  await expect(p.getByTestId("nearby-title")).toContainText("À moins de 60 km de Lyon");
  await expect(p.getByTestId("nearby-encounter").first()).toBeVisible();
  await checkPage(p, "proximite-page");
  await p.getByTestId("nearby-encounter").first().click();
  await expect(p).toHaveURL(/\/rencontres\/[a-z0-9]+$/);
  await p.goto("/rencontres/proximite");
  await p.getByTestId("nearby-back").click();
  await expect(p).toHaveURL(/\/clubs\/recherche$/);
  await p.context().close();
});

test("profil : le code postal est visible, modifiable, effaçable ; sans code, l'adresse de la page demande la ville", async ({ browser }) => {
  const p = await login(browser, "parieur2");
  await p.goto("/profil");
  const card = p.getByTestId("profile-location");
  await expect(card.getByRole("heading", { name: "Où joues-tu ?" })).toBeVisible();
  await expect(card.getByLabel("Code postal de ta ville")).toHaveValue("69003");
  await expect(card).toContainText("Commune : Lyon");
  await checkPage(p, "profil-code-postal");
  await card.getByLabel("Code postal de ta ville").fill("");
  await card.getByRole("button", { name: "Enregistrer" }).click();
  await expect(card.getByText("Code postal effacé.")).toBeVisible();
  const rows = await queryTestDb<{ postalCode: string | null; latitude: number | null }>(`SELECT "postalCode", latitude FROM "User" WHERE "displayName" = 'parieur2'`);
  expect(rows[0]).toEqual({ postalCode: null, latitude: null });
  // Adresse tapée à la main sans code : le formulaire du code postal prend la place des résultats.
  await p.goto("/rencontres/proximite");
  await expect(p.getByTestId("nearby-needs-location")).toBeVisible();
  // Valeur invalide dans le profil : message clair, rien d'enregistré.
  await p.goto("/profil");
  await card.getByLabel("Code postal de ta ville").fill("69 00");
  await card.getByRole("button", { name: "Enregistrer" }).click();
  await expect(card.getByText("Un code postal a 5 chiffres")).toBeVisible();
  await p.context().close();
});
