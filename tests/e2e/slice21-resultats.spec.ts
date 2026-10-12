import { type Browser, type Page, expect, test } from "@playwright/test";
import { checkPage, queryTestDb, seedDemoOnTestDb, signIn, signUp, wipeTestDb } from "./helpers";

// Onglet « Mes rallis » (rallis en cours et terminés, anciens Résultats et Portefeuille) : charge la vraie démo (comptes parieur1…) et compare l'écran à la base de test.

test.describe.configure({ mode: "serial" });

const PASSWORD = "demo-ralli-2026";
const newPage = async (b: Browser) => (await b.newContext()).newPage();

async function login(b: Browser, pseudo: string): Promise<Page> {
  const page = await newPage(b);
  await signIn(page, pseudo, PASSWORD, pseudo);
  await expect(page.getByTestId("nav-user")).toHaveText(pseudo);
  // La popup peut arriver un instant après le chargement : on l'attend quelques secondes avant de la fermer.
  const popup = page.getByTestId("daily-bonus");
  const shown = await popup.waitFor({ timeout: 5000 }).then(() => true, () => false);
  if (shown) await popup.getByRole("button", { name: "Super" }).click();
  await expect(popup).toBeHidden();
  return page;
}

type Truth = { status: string; n: string; committed: string | null; payout: string | null };
const truth = (pseudo: string) =>
  queryTestDb<Truth>(
    `SELECT p.status, count(*)::text AS n, sum(p."committedAces")::text AS committed, sum(p."payoutAces")::text AS payout
       FROM "Prediction" p JOIN "User" u ON u.id = p."userId"
      WHERE u."displayName" = $1 AND p.status <> 'PENDING' GROUP BY p.status`,
    [pseudo],
  );
const num = (rows: Truth[], status: string, col: "n" | "committed" | "payout") => Number(rows.find((r) => r.status === status)?.[col] ?? 0);
const digits = (s: string) => Number(s.replace(/[^\d−-]/g, "").replace("−", "-"));

test.beforeAll(async () => {
  test.setTimeout(300_000);
  seedDemoOnTestDb();
});
test.afterAll(async () => {
  await wipeTestDb();
});

test("la barre du bas a 4 onglets, « Mes rallis » entre Matchs et Classement, et l'onglet est signalé sur la page", async ({ browser }) => {
  const p = await login(browser, "parieur1");
  const nav = p.getByRole("navigation", { name: "Navigation principale" });
  await expect(nav.getByRole("link")).toHaveText(["Matchs", "Mes rallis", "Classement", "Clubs"]);
  for (const h of await nav.getByRole("link").evaluateAll((els) => els.map((e) => [e.textContent, e.getBoundingClientRect().height, e.scrollWidth <= e.clientWidth + 1] as const))) {
    expect(h[1], `hauteur de « ${h[0]} »`).toBeGreaterThanOrEqual(44);
    expect(h[2], `« ${h[0]} » ne déborde pas de sa case`).toBe(true);
  }
  await nav.getByRole("link", { name: "Mes rallis" }).click();
  await expect(p).toHaveURL(/\/rallis$/);
  await expect(p.getByRole("heading", { name: "Mes rallis", level: 1 })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Mes rallis" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Matchs" })).not.toHaveAttribute("aria-current", "page");
  await checkPage(p, "210-resultats");
});

test("parieur1 : le résumé et les compteurs correspondent exactement à la base", async ({ browser }) => {
  const rows = await truth("parieur1");
  const won = num(rows, "WON", "n"), lost = num(rows, "LOST", "n"), refunded = num(rows, "REFUNDED", "n");
  expect(won + lost + refunded, "la démo donne des rallis terminés à parieur1").toBeGreaterThan(0);
  const committed = num(rows, "WON", "committed") + num(rows, "LOST", "committed");
  const payout = num(rows, "WON", "payout");

  const p = await login(browser, "parieur1");
  await p.goto("/rallis");
  const hits = `${won} ralli${won > 1 ? "s" : ""} juste${won > 1 ? "s" : ""} sur ${won + lost}`;
  if (won + lost > 0) await expect(p.getByTestId("results-hits")).toContainText(hits);
  await expect(p.getByTestId("results-committed")).toHaveText(`${committed.toLocaleString("fr-FR")} Aces`);
  await expect(p.getByTestId("results-won-aces")).toHaveText(`${payout.toLocaleString("fr-FR")} Aces`);
  expect(digits(await p.getByTestId("results-net").innerText())).toBe(payout - committed);
  await expect(p.getByTestId("result-filter-tous")).toContainText(String(won + lost + refunded));
  await expect(p.getByTestId("result-filter-gagnes")).toContainText(String(won));
  await expect(p.getByTestId("result-filter-perdus")).toContainText(String(lost));
  await expect(p.getByTestId("result-filter-rembourses")).toContainText(String(refunded));
  // Une ligne par ralli (20 au plus d'un coup), regroupées par rencontre.
  await expect(p.getByTestId("result-item")).toHaveCount(Math.min(20, won + lost + refunded));
  expect(await p.getByTestId("result-group").count()).toBeGreaterThan(0);
  await checkPage(p, "211-resultats-demo");
});

test("les filtres ne gardent que le résultat choisi, dans l'adresse ; une valeur inconnue revient à « Tous »", async ({ browser }) => {
  const rows = await truth("parieur1");
  const won = num(rows, "WON", "n"), lost = num(rows, "LOST", "n");
  const p = await login(browser, "parieur1");
  await p.goto("/rallis");
  if (won > 0) {
    await p.getByTestId("result-filter-gagnes").click();
    await expect(p).toHaveURL(/\/rallis\?statut=gagnes$/);
    await expect(p.getByTestId("result-filter-gagnes")).toHaveAttribute("aria-current", "true");
    await expect(p.getByTestId("result-item")).toHaveCount(Math.min(20, won));
    for (const t of await p.getByTestId("result-item").allInnerTexts()) expect(t).toMatch(/Gagné/);
  }
  if (lost > 0) {
    await p.getByTestId("result-filter-perdus").click();
    await expect(p).toHaveURL(/statut=perdus$/);
    for (const t of await p.getByTestId("result-item").allInnerTexts()) expect(t).toMatch(/Perdu/);
  }
  await p.goto("/rallis?statut=nimporte<script>&limite=abc");
  await expect(p.getByTestId("result-filter-tous")).toHaveAttribute("aria-current", "true");
  await expect(p.getByTestId("result-item").first()).toBeVisible();
  await p.getByTestId("result-item").first().click(); // toucher une ligne ouvre la rencontre
  await expect(p).toHaveURL(/\/rencontres\//);
});

test("chacun ne voit que ses rallis : parieur2 voit le décompte de sa propre base, pas celui de parieur1", async ({ browser }) => {
  const r2 = await truth("parieur2");
  const total2 = r2.reduce((s, r) => s + Number(r.n), 0);
  const p = await login(browser, "parieur2");
  await p.goto("/rallis");
  if (total2 === 0) await expect(p.getByTestId("results-empty")).toBeVisible();
  else await expect(p.getByTestId("result-filter-tous")).toContainText(String(total2));
  // Un compte sans aucun ralli (admin du club) ne voit aucune ligne.
  const a = await login(browser, "admin_nantes");
  await a.goto("/rallis");
  await expect(a.getByTestId("result-item")).toHaveCount(0);
});

test("les anciennes adresses mènent à « Mes rallis » (filtre conservé) ; l'historique des Aces est replié, les rallis en cours sont en haut", async ({ browser }) => {
  const p = await login(browser, "parieur1");
  await p.goto("/portefeuille");
  await expect(p).toHaveURL(/\/rallis$/);
  await p.goto("/resultats?statut=gagnes");
  await expect(p).toHaveURL(/\/rallis\?statut=gagnes$/);
  await expect(p.getByTestId("result-filter-gagnes")).toHaveAttribute("aria-current", "true");
  await p.goto("/rallis");
  await expect(p.getByRole("heading", { name: "En cours" })).toBeVisible();
  await expect(p.getByTestId("settled")).toHaveCount(0);
  await expect(p.getByRole("heading", { name: "Pronostics terminés" })).toHaveCount(0);
  // L'historique est un bloc replié : fermé au départ, il s'ouvre au toucher et montre les mouvements.
  const ledger = p.getByTestId("ledger-section");
  await expect(ledger).not.toHaveAttribute("open", "");
  await expect(p.getByTestId("ledger")).toBeHidden();
  await ledger.locator("summary").click();
  await expect(p.getByTestId("ledger")).toBeVisible();
  await expect(p.getByTestId("ledger")).toContainText("Aces gagnés");
  // Ordre de la page : en cours, bilan, liste, historique.
  const y = async (id: string) => (await p.getByTestId(id).boundingBox())!.y;
  expect(await y("pending-section")).toBeLessThan(await y("results-summary"));
  expect(await y("results-summary")).toBeLessThan(await y("ledger-section"));
});

test("compte neuf : écran vide expliqué, sans filtres, avec un lien vers les matchs ; visiteur renvoyé à la connexion", async ({ browser }) => {
  const rita = await newPage(browser);
  await signUp(rita, "Rita21");
  await rita.goto("/rallis");
  await expect(rita.getByTestId("results-hits")).toHaveText("Aucun ralli terminé pour l'instant");
  await expect(rita.getByTestId("results-empty")).toContainText("Aucun ralli terminé pour l'instant");
  await expect(rita.getByTestId("result-filters")).toHaveCount(0);
  await expect(rita.getByTestId("results-refunded-note")).toHaveCount(0);
  await checkPage(rita, "212-resultats-vide");
  await rita.getByRole("link", { name: "Voir les matchs" }).click();
  await expect(rita).toHaveURL(/\/$/);

  const anon = await newPage(browser);
  await anon.goto("/resultats");
  await expect(anon).toHaveURL(/\/connexion/);
});
