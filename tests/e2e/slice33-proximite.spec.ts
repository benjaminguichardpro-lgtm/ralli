import { type Browser, type Page, expect, test } from "@playwright/test";
import { checkPage, queryTestDb, seedDemoOnTestDb, signIn, wipeTestDb } from "./helpers";

// Barre de distance sous les onglets de l'accueil (« Interclubs à venir », « Tournoi à venir ») : « Mes clubs » par défaut, raccourcis et curseur
// de « Mes clubs » à « Toute la France », « Où es-tu ? » sans code postal ; page « Interclub à proximité » ouverte depuis la recherche de clubs ;
// code postal du profil. La démo place ses trois clubs
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

const slider = (p: Page) => p.getByTestId("radius-form").getByRole("slider", { name: "Distance de recherche" });
/** La page est prête (hydratée) avant qu'on touche à la barre. */
async function ready(p: Page, value: string) {
  await expect(slider(p)).toHaveValue(value);
  await p.waitForLoadState("networkidle");
}

test("la barre est juste sous les onglets, sur « Mes clubs » par défaut, avec ses raccourcis ; plus de bouton « à proximité » sur l'accueil", async ({ browser }) => {
  const p = await login(browser, "parieur1");
  await p.goto("/");
  await expect(p.getByTestId("nearby-button")).toHaveCount(0);
  await expect(p.getByTestId("feed")).toBeVisible();
  const tabs = await p.getByTestId("home-tabs").boundingBox();
  const bar = await p.getByTestId("radius-form").boundingBox();
  expect(bar!.y).toBeGreaterThan(tabs!.y + tabs!.height - 1);
  expect(bar!.y - (tabs!.y + tabs!.height)).toBeLessThan(40); // collée sous les onglets
  await expect(slider(p)).toHaveAttribute("min", "0");
  await expect(slider(p)).toHaveAttribute("max", "201"); // 0 = mes clubs, 1 à 200 km, 201 = toute la France
  await expect(p.getByTestId("radius-value")).toHaveText("Mes clubs");
  await expect(p.getByTestId("radius-chip-0")).toHaveAttribute("aria-pressed", "true");
  await expect(p.getByTestId("radius-chip-30")).toHaveAttribute("aria-pressed", "false");
  await expect(p.getByTestId("radius-count")).toHaveText(/^\d+ interclubs?$/);
  await checkPage(p, "barre-distance-accueil");
  // Le raccourci « 30 km » règle la barre d'un seul geste ; l'onglet reste « Interclubs à venir ».
  await ready(p, "0");
  await p.getByTestId("radius-chip-30").click();
  await expect(p.getByTestId("radius-value")).toHaveText("30 km");
  await expect(slider(p)).toHaveValue("30");
  await expect(p.getByTestId("home-tab-a-venir")).toHaveAttribute("aria-current", "page");
  await p.context().close();
});

test("sans code postal : un rayon en km demande « Où es-tu ? » (code invalide refusé, rien d'enregistré) ; « Mes clubs » et « France » n'en ont pas besoin", async ({ browser }) => {
  const p = await login(browser, "parieur1");
  await p.goto("/");
  await ready(p, "30"); // le scénario précédent a réglé 30 km : sans code postal, la page le demande tout de suite
  const card = p.getByTestId("nearby-needs-location");
  await expect(card.getByRole("heading", { name: "Où es-tu ?" })).toBeVisible();
  await card.getByLabel("Code postal de ta ville").fill("123");
  await card.getByRole("button", { name: "Valider" }).click();
  await expect(card.getByText("Un code postal a 5 chiffres")).toBeVisible();
  const rows = await queryTestDb<{ postalCode: string | null }>(`SELECT "postalCode" FROM "User" WHERE "displayName" = 'parieur1'`);
  expect(rows[0]!.postalCode).toBeNull();
  await checkPage(p, "barre-distance-sans-code");
  await p.getByTestId("radius-chip-999").click(); // toute la France : pas de code nécessaire
  await expect(p.getByTestId("radius-value")).toHaveText("Toute la France");
  await expect(p.getByTestId("nearby-needs-location")).toHaveCount(0);
  await p.getByTestId("radius-chip-0").click();
  await expect(p.getByTestId("feed")).toBeVisible();
  await p.context().close();
});

test("page « Interclub à proximité » depuis la recherche de clubs : sans code postal, la fenêtre « Où es-tu ? » ; code valide enregistré (30 km)", async ({ browser }) => {
  test.skip(!networkOk, "service des communes injoignable");
  const p = await login(browser, "parieur1");
  await p.goto("/clubs/recherche");
  const button = p.getByTestId("nearby-button");
  await expect(button).toHaveText("Voir les interclubs à proximité");
  await button.click();
  const dialog = p.getByTestId("nearby-dialog");
  await expect(dialog.getByRole("heading", { name: "Où es-tu ?" })).toBeVisible();
  await dialog.getByLabel("Code postal de ta ville").fill("99999");
  await dialog.getByRole("button", { name: "Valider" }).click();
  await expect(dialog.getByText("Code postal introuvable")).toBeVisible();
  await dialog.getByLabel("Code postal de ta ville").fill("69003");
  // Le vrai service des communes peut être lent ou indisponible un instant : l'application le dit (« réessaie dans un instant »), on réessaie.
  for (let essai = 0; essai < 3; essai++) {
    await dialog.getByRole("button", { name: "Valider" }).click();
    const reussi = await p.waitForURL(/\/rencontres\/proximite$/, { timeout: 12_000 }).then(() => true, () => false);
    if (reussi) break;
    await expect(dialog.getByText("réessaie dans un instant")).toBeVisible();
  }
  await expect(p).toHaveURL(/\/rencontres\/proximite$/);
  const rows = await queryTestDb<{ postalCode: string; commune: string }>(`SELECT "postalCode", commune FROM "User" WHERE "displayName" = 'parieur1'`);
  expect(rows[0]).toEqual({ postalCode: "69003", commune: "Lyon" });
  await p.context().close();
});

test("avec un code postal : la barre remplace le fil par les interclubs du rayon, avec les distances ; « Mes clubs » rend le fil", async ({ browser }) => {
  const p = await login(browser, "parieur2");
  await p.goto("/");
  await expect(p.getByTestId("feed")).toBeVisible();
  await ready(p, "0");
  await p.getByTestId("radius-chip-30").click();
  await expect(p.getByTestId("radius-scope")).toContainText("À moins de 30 km de Lyon");
  await expect(p.getByTestId("feed")).toHaveCount(0);
  const lyon = upcoming.find((u) => u.club === "TC Démo-Lyon")!;
  await expect(p.getByTestId("nearby-encounter")).toHaveCount(lyon.n);
  await expect(p.getByTestId("radius-count")).toHaveText(`${lyon.n} interclub${lyon.n > 1 ? "s" : ""}`);
  await expect(p.getByTestId("nearby-encounter").first()).toContainText("TC Démo-Lyon");
  await expect(p.getByTestId("nearby-distance").first()).toHaveText(/^· à (moins de 1|\d+) km$/);
  await expect(p.getByTestId("nearby-list")).not.toContainText("TC Démo-Nantes"); // ~ 500 km
  await checkPage(p, "proximite-accueil");
  await p.getByTestId("radius-chip-0").click();
  await expect(p.getByTestId("feed")).toBeVisible();
  await p.context().close();
});

test("curseur : 1 km (vide), 30 km (Lyon), 60 km (Lyon et Nantes rapproché) ; s'applique tout seul ; gardé pour la prochaine fois", async ({ browser }) => {
  // On rapproche le club de Nantes de Lyon (~ 50 km, vers Saint-Étienne) : le rayon décide alors de sa présence.
  await queryTestDb(`UPDATE "Club" SET latitude = 45.4397, longitude = 4.3872 WHERE name = 'TC Démo-Nantes'`);
  const count = (...clubs: string[]) => upcoming.filter((u) => clubs.includes(u.club)).reduce((sum, u) => sum + u.n, 0);
  const p = await login(browser, "parieur2");
  await p.goto("/");
  await ready(p, "0");
  await slider(p).fill("1"); // pas de bouton « Appliquer » : le rayon s'applique quand le curseur est lâché
  await expect(p.getByTestId("radius-value")).toHaveText("1 km");
  await expect(p.getByTestId("radius-scope")).toContainText("À moins de 1 km de Lyon");
  await expect(p.getByTestId("nearby-empty")).toContainText("Aucune rencontre à moins de 1 km pour l'instant.");
  await expect(p.getByTestId("nearby-empty").getByRole("link", { name: "Voir la carte des clubs" })).toBeVisible();
  await slider(p).fill("30");
  await expect(p.getByTestId("radius-scope")).toContainText("À moins de 30 km de Lyon");
  await expect(p.getByTestId("nearby-encounter")).toHaveCount(count("TC Démo-Lyon"));
  await slider(p).fill("60");
  await expect(p.getByTestId("radius-scope")).toContainText("À moins de 60 km de Lyon");
  await expect(p.getByTestId("nearby-encounter")).toHaveCount(count("TC Démo-Lyon", "TC Démo-Nantes"));
  await expect(p.getByTestId("nearby-list")).toContainText("TC Démo-Nantes");
  await checkPage(p, "proximite-curseur");
  // Gardé dans le compte : au rechargement, 60 km.
  await p.goto("/");
  await expect(p.getByTestId("radius-value")).toHaveText("60 km");
  await expect(p.getByTestId("radius-scope")).toContainText("À moins de 60 km de Lyon");
  const rows = await queryTestDb<{ radius: number }>(`SELECT "nearbyRadiusKm" AS radius FROM "User" WHERE "displayName" = 'parieur2'`);
  expect(rows[0]!.radius).toBe(60);
  await p.context().close();
});

test("sur la recherche de clubs : le bouton ouvre la page « Interclub à proximité », avec la même barre", async ({ browser }) => {
  const p = await login(browser, "parieur2");
  await p.goto("/clubs/recherche");
  const bar = await p.getByRole("searchbox", { name: "Rechercher un club" }).boundingBox();
  const btn = await p.getByTestId("nearby-button").boundingBox();
  expect(btn!.y).toBeGreaterThan(bar!.y);
  await p.getByTestId("nearby-button").click();
  await expect(p).toHaveURL(/\/rencontres\/proximite$/);
  await expect(p.getByRole("heading", { name: "Interclub à proximité" })).toBeVisible();
  await expect(p.getByTestId("radius-scope")).toContainText("À moins de 60 km de Lyon");
  await expect(p.getByTestId("radius-form")).toBeVisible();
  await expect(p.getByTestId("nearby-encounter").first()).toBeVisible();
  await checkPage(p, "proximite-page");
  await p.getByTestId("nearby-encounter").first().click();
  await expect(p).toHaveURL(/\/rencontres\/[a-z0-9]+$/);
  await p.goto("/rencontres/proximite");
  await p.getByTestId("nearby-back").click();
  await expect(p).toHaveURL(/\/clubs\/recherche$/);
  // L'ancien lien de l'accueil renvoie à l'accueil.
  await p.goto("/?proximite=1");
  await expect(p).toHaveURL(/\/$/);
  await p.context().close();
});

test("profil : le code postal est visible, modifiable, effaçable ; sans code, la page demande la ville", async ({ browser }) => {
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
  // Rayon de 60 km sans code : le formulaire du code postal prend la place des résultats.
  await p.goto("/rencontres/proximite");
  await expect(p.getByTestId("nearby-needs-location")).toBeVisible();
  // Valeur invalide dans le profil : message clair, rien d'enregistré.
  await p.goto("/profil");
  await card.getByLabel("Code postal de ta ville").fill("69 00");
  await card.getByRole("button", { name: "Enregistrer" }).click();
  await expect(card.getByText("Un code postal a 5 chiffres")).toBeVisible();
  await p.context().close();
});

test("interclubs : « Mes clubs » (0) et « Toute la France » (dernier cran), sans code postal", async ({ browser }) => {
  // parieur6 est membre de Lyon seulement ; Nantes a aussi des rencontres à venir (hors de ses clubs).
  const mineCount = upcoming.filter((u) => u.club === "TC Démo-Lyon").reduce((sum, u) => sum + u.n, 0);
  const allCount = upcoming.reduce((sum, u) => sum + u.n, 0);
  expect(allCount).toBeGreaterThan(mineCount);
  const p = await login(browser, "parieur6");
  await p.goto("/");
  await ready(p, "0");
  await expect(p.getByTestId("radius-value")).toHaveText("Mes clubs");
  await p.getByTestId("radius-chip-999").click();
  await expect(p.getByTestId("radius-value")).toHaveText("Toute la France");
  await expect(p.getByTestId("radius-scope")).toContainText("Toute la France");
  await expect(p.getByTestId("nearby-encounter")).toHaveCount(allCount);
  await expect(p.getByTestId("nearby-list")).toContainText("TC Démo-Nantes");
  await expect(slider(p)).toHaveValue("201");
  await slider(p).fill("0");
  await expect(p.getByTestId("radius-value")).toHaveText("Mes clubs");
  await expect(p.getByTestId("feed")).toBeVisible();
  await p.getByTestId("radius-chip-999").click(); // gardé : « Toute la France »
  await expect(p.getByTestId("nearby-encounter")).toHaveCount(allCount);
  const rows = await queryTestDb<{ radius: number }>(`SELECT "nearbyRadiusKm" AS radius FROM "User" WHERE "displayName" = 'parieur6'`);
  expect(rows[0]!.radius).toBe(999);
  await checkPage(p, "proximite-france");
  await p.context().close();
});

test("onglet « Tournoi à venir » : même barre, de 0 (mes clubs) à toute la France, le plus proche d'abord, réglage gardé", async ({ browser }) => {
  // Un tournoi publié du club de Nantes, rapproché de Lyon (~ 45 km, vers Saint-Étienne) ; parieur4 est membre de Lyon seulement.
  await queryTestDb(`UPDATE "Club" SET latitude = 45.4397, longitude = 4.3872 WHERE name = 'TC Démo-Nantes'`);
  await queryTestDb(
    `INSERT INTO "Tournament" (id, "clubId", name, "drawSize", "startsAt", status, "createdById", "publishedAt")
     SELECT 'tournoi-nantes', c.id, 'Tournoi de Nantes', 4, now() + interval '2 days', 'OPEN', u.id, now()
       FROM "Club" c, "User" u WHERE c.name = 'TC Démo-Nantes' AND u."displayName" = 'admin_nantes'`,
  );
  await queryTestDb(`UPDATE "User" SET "postalCode" = '69003', commune = 'Lyon', latitude = 45.758, longitude = 4.8351 WHERE "displayName" = 'parieur4'`);
  const p = await login(browser, "parieur4");
  await p.goto("/");
  await p.getByTestId("home-tab-tournois").click();
  const cards = p.getByTestId("tournament-card");
  // La barre est sous les onglets ; par défaut 0 km = mes clubs (comme avant).
  const tabs = await p.getByTestId("home-tabs").boundingBox();
  const bar = await p.getByTestId("radius-form").boundingBox();
  expect(bar!.y).toBeGreaterThan(tabs!.y + tabs!.height - 1);
  await ready(p, "0");
  await expect(p.getByTestId("radius-scope")).toContainText("Mes clubs");
  await expect(p.getByTestId("radius-count")).toHaveText("1 tournoi");
  await expect(p.getByTestId("home-tournaments-current")).toContainText("Tournoi d'automne");
  await expect(p.getByTestId("home-tournaments-current")).not.toContainText("Tournoi de Nantes");
  // 30 km : Nantes est trop loin ; 60 km : Nantes entre, Lyon (plus proche) reste devant, avec sa distance.
  await slider(p).fill("30");
  await expect(p.getByTestId("radius-scope")).toContainText("À moins de 30 km de Lyon");
  await expect(p.getByTestId("home-tournaments-current")).not.toContainText("Tournoi de Nantes");
  await slider(p).fill("60");
  await expect(p.getByTestId("radius-scope")).toContainText("À moins de 60 km de Lyon");
  await expect(cards).toHaveCount(2);
  await expect(p.getByTestId("radius-count")).toHaveText("2 tournois");
  await expect(cards.first()).toContainText("Tournoi d'automne");
  await expect(cards.nth(1)).toContainText("Tournoi de Nantes");
  await expect(cards.nth(1).getByTestId("tournament-distance")).toHaveText(/^à \d+ km$/);
  await expect(cards.first()).toContainText("Membre");
  await expect(cards.nth(1)).not.toContainText("Membre");
  await checkPage(p, "tournois-distance");
  // Toute la France, gardé dans le compte (séparé du réglage des interclubs).
  await p.getByTestId("radius-chip-999").click();
  await expect(p.getByTestId("radius-scope")).toContainText("Toute la France");
  await p.reload();
  await expect(p.getByTestId("home-tab-tournois")).toHaveAttribute("aria-current", "page");
  await expect(p.getByTestId("radius-value")).toHaveText("Toute la France");
  const rows = await queryTestDb<{ t: number; n: number }>(`SELECT "tournamentRadiusKm" AS t, "nearbyRadiusKm" AS n FROM "User" WHERE "displayName" = 'parieur4'`);
  expect(rows[0]).toEqual({ t: 999, n: 0 });
  // Le tournoi d'un autre club se suit : sa page s'ouvre, sans pouvoir le pronostiquer (club non rejoint).
  await cards.nth(1).click();
  await expect(p).toHaveURL(/\/tournois\/tournoi-nantes$/);
  await expect(p.getByTestId("join-to-predict")).toBeVisible();
  await p.context().close();
});

test("« Tournoi à venir » sans code postal : « Où es-tu ? » à partir d'un rayon en km ; « Mes clubs » et « France » n'en ont pas besoin", async ({ browser }) => {
  const p = await login(browser, "parieur5");
  await p.goto("/?onglet=tournois");
  await ready(p, "0");
  await expect(p.getByTestId("tournaments-needs-location")).toHaveCount(0); // 0 km : pas besoin
  await p.getByTestId("radius-chip-50").click();
  await expect(p.getByTestId("tournaments-needs-location")).toBeVisible();
  await expect(p.getByTestId("tournaments-needs-location").getByLabel("Code postal de ta ville")).toBeVisible();
  await p.getByTestId("radius-chip-999").click();
  await expect(p.getByTestId("tournaments-needs-location")).toHaveCount(0);
  await expect(p.getByTestId("tournament-card").first()).toBeVisible();
  await checkPage(p, "tournois-sans-code");
  await p.context().close();
});
