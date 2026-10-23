import { type Browser, type Page, expect, test } from "@playwright/test";
import { checkPage, queryTestDb, seedDemoOnTestDb, signIn, wipeTestDb } from "./helpers";

// Archivage des rencontres terminées ou annulées, sur la démo de TC Démo-Lyon.
// admin_lyon (admin), capitaine_dames_lyon (Dames 1), capitaine_lyon (Messieurs 1), parieur1 (membre simple).
// Rencontres de Lyon : 4 terminées (2 Messieurs 1, 2 Dames 1), 1 annulée (Dames 1), 1 contestée, 1 score proposé, 1 verrouillée, 1 ouverte, 1 brouillon.

test.describe.configure({ mode: "serial" });

const PASSWORD = "Demo-ralli-2026!";
let clubUrl: string;
let admin: Page, dames: Page, messieurs: Page, membre: Page;

const newPage = async (b: Browser) => (await b.newContext()).newPage();
const mainList = (p: Page) => p.getByTestId("encounter-list").first();
const crosses = (p: Page) => mainList(p).getByTestId("archive-encounter");

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
  const club = await queryTestDb<{ id: string }>(`SELECT id FROM "Club" WHERE name = 'TC Démo-Lyon'`);
  clubUrl = `/clubs/${club[0]!.id}`;
  admin = await login(browser, "admin_lyon");
  dames = await login(browser, "capitaine_dames_lyon");
  messieurs = await login(browser, "capitaine_lyon");
  membre = await login(browser, "parieur1");
});

test.afterAll(async () => {
  await wipeTestDb();
});

test("l'admin voit une croix rouge sur chaque rencontre terminée ou annulée, et seulement celles-là", async () => {
  await admin.goto(clubUrl);
  await expect(mainList(admin).locator("li")).toHaveCount(10); // 4 terminées, 1 annulée, 1 contestée, 1 proposée, 1 verrouillée, 1 ouverte, 1 brouillon
  await expect(crosses(admin)).toHaveCount(5); // 4 terminées + 1 annulée
  for (const row of await mainList(admin).locator("li").all()) {
    const text = await row.innerText();
    const archivable = /Victoire|Défaite|Nul|Annulée/.test(text); // terminée (badge de résultat) ou annulée
    await expect(row.getByTestId("archive-encounter"), text).toHaveCount(archivable ? 1 : 0);
  }
  await expect(admin.getByTestId("archives")).toHaveCount(0);
  await checkPage(admin, "95-archivage-croix");
});

test("la croix demande confirmation : annuler ne change rien, accepter archive", async () => {
  const cancelledRow = mainList(admin).locator("li").filter({ hasText: "Annulée" });
  admin.once("dialog", (d) => {
    expect(d.message()).toContain("Archiver cette rencontre ?");
    void d.dismiss();
  });
  await cancelledRow.getByTestId("archive-encounter").click();
  await expect(mainList(admin).locator("li")).toHaveCount(10);

  admin.once("dialog", (d) => void d.accept());
  await cancelledRow.getByTestId("archive-encounter").click();
  await expect(mainList(admin).locator("li")).toHaveCount(9);
  await expect(mainList(admin).locator("li").filter({ hasText: "Annulée" })).toHaveCount(0);
  const archives = admin.getByTestId("archives");
  await expect(archives.locator("summary")).toHaveText("Archives (1)");
  await archives.locator("summary").click();
  await expect(archives.getByTestId("encounter-list").locator("li")).toHaveCount(1);
  await expect(archives.getByTestId("encounter-list")).toContainText("Annulée");
  await expect(archives.getByTestId("unarchive-encounter")).toBeVisible();
  await checkPage(admin, "96-archives-ouvertes");
});

test("tout le club ne voit plus la rencontre archivée ; les archives sont réservées aux admins et capitaines", async () => {
  await membre.goto(clubUrl);
  await expect(mainList(membre).locator("li")).toHaveCount(8); // sans brouillon ni archivée
  await expect(crosses(membre)).toHaveCount(0);
  await expect(membre.getByTestId("archives")).toHaveCount(0);

  // Capitaine des Dames : croix sur les rencontres de son équipe seulement ; archives visibles avec « Désarchiver » (c'est son équipe).
  await dames.goto(clubUrl);
  await expect(crosses(dames)).toHaveCount(2); // les deux rencontres terminées de Dames 1
  await dames.getByTestId("archives").locator("summary").click();
  await expect(dames.getByTestId("archives").getByTestId("unarchive-encounter")).toHaveCount(1);

  // Capitaine des Messieurs : voit les archives, mais ne peut pas désarchiver une rencontre des Dames ; croix sur les siennes.
  await messieurs.goto(clubUrl);
  await expect(crosses(messieurs)).toHaveCount(2);
  await messieurs.getByTestId("archives").locator("summary").click();
  await expect(messieurs.getByTestId("archives").getByTestId("encounter-list").locator("li")).toHaveCount(1);
  await expect(messieurs.getByTestId("archives").getByTestId("unarchive-encounter")).toHaveCount(0);
});

test("archiver une rencontre terminée ne change pas le classement ; sa page reste accessible, avec une trace au journal", async () => {
  await admin.goto(`${clubUrl}/classement`);
  const rows = admin.getByTestId("leaderboard-row");
  const before = await rows.allInnerTexts();
  expect(before.length).toBeGreaterThanOrEqual(5);

  await admin.goto(clubUrl);
  const done = mainList(admin).locator("li").filter({ has: admin.getByTestId("result-badge") }).first(); // une rencontre terminée
  const href = (await done.getByRole("link").first().getAttribute("href"))!;
  admin.once("dialog", (d) => void d.accept());
  await done.getByTestId("archive-encounter").click();
  await expect(admin.getByTestId("archives").locator("summary")).toHaveText("Archives (2)");

  await admin.goto(`${clubUrl}/classement`);
  expect(await rows.allInnerTexts()).toEqual(before);

  await admin.goto(href);
  await expect(admin.getByText("Terminée", { exact: true })).toBeVisible();
  const journal = admin.getByTestId("journal");
  await journal.locator("summary").click();
  await expect(journal).toContainText("Archivée");
  // Un membre simple y accède aussi (lien partagé), et ne voit pas le journal.
  await membre.goto(href);
  await expect(membre.getByText("Terminée", { exact: true })).toBeVisible();
});

test("désarchiver remet la rencontre dans la liste du club", async () => {
  await admin.goto(clubUrl);
  const archives = admin.getByTestId("archives");
  await archives.locator("summary").click();
  await archives.getByTestId("unarchive-encounter").first().click();
  await expect(archives.locator("summary")).toHaveText("Archives (1)");
  await archives.getByTestId("unarchive-encounter").first().click();
  await expect(admin.getByTestId("archives")).toHaveCount(0);
  await expect(mainList(admin).locator("li")).toHaveCount(10);
  await expect(crosses(admin)).toHaveCount(5);
});
