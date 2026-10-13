import { type Browser, type Page, expect, test } from "@playwright/test";
import { checkPage, queryTestDb, seedDemoOnTestDb, signIn, wipeTestDb } from "./helpers";

// Résultats au centre : « Derniers résultats » sur l'accueil (le détail à un clic), page « Résultats » filtrable par club et
// par équipe, score provisoire marqué comme tel. Charge la vraie démo ; parieur1 est membre de Lyon et de Nantes.

test.describe.configure({ mode: "serial" });

const PASSWORD = "demo-ralli-2026";
type Row = { id: string; status: string; club: string; clubId: string };
let all: Row[]; // résultats des clubs de parieur1, du plus récent au plus ancien
let lyonId: string;

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
  await wipeTestDb(); // un fichier lancé juste avant a pu laisser sa démo dans la base de test
  seedDemoOnTestDb();
  all = await queryTestDb<Row>(
    `SELECT e.id, e.status, c.name AS club, c.id AS "clubId" FROM "Encounter" e
     JOIN "Club" c ON c.id = e."organizerClubId" JOIN "ClubMembership" cm ON cm."clubId" = c.id JOIN "User" u ON u.id = cm."userId"
     WHERE u."displayName" = 'parieur1' AND e.status IN ('CONFIRMED', 'SCORE_PROPOSED') AND e."archivedAt" IS NULL
     ORDER BY e."startsAt" DESC, e.id DESC`,
  );
  expect(all.length).toBeGreaterThan(1);
  lyonId = (await queryTestDb<{ id: string }>(`SELECT id FROM "Club" WHERE name = 'TC Démo-Lyon'`))[0]!.id;
});
test.afterAll(wipeTestDb);

test("accueil : deux onglets, « Rencontres à venir » par défaut, « Résultats » à un clic ; le choix reste dans l'adresse", async ({ browser }) => {
  const p = await login(browser, "parieur1");
  await p.goto("/");
  const tabs = p.getByTestId("home-tabs");
  await expect(tabs.getByRole("link")).toHaveText(["Résultats", "Rencontres à venir"]);
  await expect(p.getByTestId("home-tab-a-venir")).toHaveAttribute("aria-current", "page");
  await expect(p.getByTestId("home-tab-resultats")).not.toHaveAttribute("aria-current", "page");
  await expect(p.getByTestId("feed")).toBeVisible();
  await expect(p.getByTestId("home-results")).toHaveCount(0);
  await checkPage(p, "accueil-onglet-a-venir");
  await p.getByTestId("home-tab-resultats").click();
  await expect(p).toHaveURL(/\/\?onglet=resultats$/);
  await expect(p.getByTestId("home-tab-resultats")).toHaveAttribute("aria-current", "page");
  await expect(p.getByTestId("home-results")).toBeVisible();
  await expect(p.getByTestId("feed")).toHaveCount(0);
  await p.getByTestId("home-tab-a-venir").click();
  await expect(p).toHaveURL(/\/$/);
  await expect(p.getByTestId("feed")).toBeVisible();
  // Adresse directe sur l'onglet ; valeur inconnue : l'onglet par défaut.
  await p.goto("/?onglet=resultats");
  await expect(p.getByTestId("home-results")).toBeVisible();
  await p.goto("/?onglet=nimporte");
  await expect(p.getByTestId("feed")).toBeVisible();
  await p.context().close();
});

test("onglet Résultats : les derniers résultats sont là, et le détail est à un clic", async ({ browser }) => {
  const p = await login(browser, "parieur1");
  await p.goto("/");
  await p.getByTestId("home-tab-resultats").click();
  const block = p.getByTestId("home-results");
  await expect(block.getByRole("heading", { name: "Derniers résultats" })).toBeVisible();
  const cards = block.getByTestId("result-card");
  await expect(cards).toHaveCount(Math.min(5, all.length));
  await expect(cards.first().getByTestId("result-score")).toHaveText(/^\d+ – \d+$/);
  await expect(cards.first().getByTestId("result-badge")).toBeVisible();
  await checkPage(p, "resultats-accueil");
  // Un clic : la page de la rencontre, avec le score et les matchs.
  await cards.first().click();
  await expect(p).toHaveURL(new RegExp(`/rencontres/${all[0]!.id}$`));
  await expect(p.getByTestId("tally")).toBeVisible();
  await p.context().close();
});

test("un score proposé s'affiche « provisoire » partout : carte, liste, page de la rencontre", async ({ browser }) => {
  const proposed = all.find((r) => r.status === "SCORE_PROPOSED");
  test.skip(!proposed, "pas de score proposé dans la démo");
  const p = await login(browser, "parieur1");
  await p.goto("/resultats-clubs");
  const card = p.getByTestId("result-card").filter({ has: p.getByTestId("result-badge").filter({ hasText: /^Provisoire/ }) });
  await expect(card).toHaveCount(all.filter((r) => r.status === "SCORE_PROPOSED").length);
  await card.first().click();
  await expect(p.getByTestId("tally")).toContainText("Score provisoire");
  await expect(p.getByTestId("provisional-note")).toBeVisible();
  await p.context().close();
});

test("« Tous les résultats » : la page, les puces de clubs et d'équipes, le résultat filtré", async ({ browser }) => {
  const p = await login(browser, "parieur1");
  // Next garde l'écran précédent (l'accueil et ses cartes) masqué dans la page : on ne compte que les cartes visibles.
  const visibleCards = p.locator('[data-testid="result-card"]:visible');
  await p.goto("/?onglet=resultats");
  await p.getByTestId("all-results").click();
  await expect(p).toHaveURL(/\/resultats-clubs$/);
  await expect(p.getByRole("heading", { name: "Résultats" })).toBeVisible();
  await expect(visibleCards).toHaveCount(Math.min(20, all.length));
  await checkPage(p, "resultats-page");
  // Deux clubs : puces « Tous mes clubs », Lyon, Nantes.
  const chips = p.getByTestId("results-club-chips");
  await expect(chips.getByTestId("results-club-all")).toHaveAttribute("aria-current", "true");
  await chips.getByRole("link", { name: "TC Démo-Lyon" }).click();
  await expect(p).toHaveURL(new RegExp(`/resultats-clubs\\?club=${lyonId}$`));
  const lyon = all.filter((r) => r.clubId === lyonId);
  await expect(visibleCards).toHaveCount(Math.min(20, lyon.length));
  // Les équipes du club apparaissent ; un choix filtre encore.
  const teams = p.getByTestId("results-team-chips");
  await expect(teams.getByTestId("results-team-all")).toHaveAttribute("aria-current", "true");
  const teamChips = teams.getByTestId("results-team-chip");
  expect(await teamChips.count()).toBeGreaterThan(1);
  const total = await visibleCards.count();
  await teamChips.first().click();
  await expect(p).toHaveURL(/equipe=/);
  expect(await visibleCards.count()).toBeLessThanOrEqual(total);
  await teams.getByTestId("results-team-all").click();
  await expect(visibleCards).toHaveCount(total);
  // Une valeur inconnue dans l'adresse revient à « Tous ».
  await p.goto("/resultats-clubs?club=inconnu&equipe=nimporte");
  await expect(visibleCards).toHaveCount(Math.min(20, all.length));
  await p.context().close();
});

test("page du club : un raccourci « Tous les résultats » filtré sur le club", async ({ browser }) => {
  const p = await login(browser, "parieur1");
  await p.goto(`/clubs/${lyonId}`);
  await p.getByTestId("club-results-link").click();
  await expect(p).toHaveURL(new RegExp(`/resultats-clubs\\?club=${lyonId}$`));
  await expect(p.getByTestId("results-club-chips").getByRole("link", { name: "TC Démo-Lyon" })).toHaveAttribute("aria-current", "true");
  await p.context().close();
});

test("un club sans résultat : message clair dans l'onglet Résultats de l'accueil et sur la page Résultats", async ({ browser }) => {
  const p = await login(browser, "admin_bordeaux");
  await p.goto("/?onglet=resultats");
  await expect(p.getByTestId("home-results")).toHaveCount(0);
  await expect(p.getByTestId("home-results-empty")).toContainText("Pas encore de résultat");
  await p.goto("/resultats-clubs");
  await expect(p.getByTestId("results-empty")).toContainText("Aucun résultat pour l'instant");
  await expect(p.getByTestId("results-club-chips")).toHaveCount(0); // un seul club : pas de puces de clubs
  await p.context().close();
});
