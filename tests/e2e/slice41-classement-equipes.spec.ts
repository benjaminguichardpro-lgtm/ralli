import { type Browser, type Page, expect, test } from "@playwright/test";
import { checkPage, queryTestDb, seedDemoOnTestDb, signIn, wipeTestDb } from "./helpers";

// Classement des équipes : page du club (membre), page « Résultats des clubs » et page publique. Charge la vraie démo :
// admin_lyon administre TC Démo-Lyon.

test.describe.configure({ mode: "serial" });

const PASSWORD = "demo-ralli-2026";
let lyonId: string;
let teams: number;
let played: number;

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

const playedCells = async (p: Page, scope: string) => {
  const rows = p.getByTestId(scope).getByTestId("standing-row");
  const n = await rows.count();
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Number(await rows.nth(i).locator("td").nth(2).innerText());
  return { n, sum };
};

test.beforeAll(async () => {
  test.setTimeout(300_000);
  await wipeTestDb();
  seedDemoOnTestDb();
  lyonId = (await queryTestDb<{ id: string }>(`SELECT id FROM "Club" WHERE name = 'TC Démo-Lyon'`))[0]!.id;
  teams = Number((await queryTestDb<{ n: string }>(`SELECT count(*) AS n FROM "Team" WHERE "clubId" = '${lyonId}' AND kind = 'CLUB'`))[0]!.n);
  played = Number(
    (await queryTestDb<{ n: string }>(
      `SELECT count(*) AS n FROM "Encounter" e JOIN "Team" t ON t.id IN (e."homeTeamId", e."awayTeamId") AND t.kind = 'CLUB'
       WHERE e."organizerClubId" = '${lyonId}' AND e.status = 'CONFIRMED' AND e."startsAt" >= '2026-09-01T00:00:00+02' AND e."startsAt" < '2027-09-01T00:00:00+02'`,
    ))[0]!.n,
  );
});
test.afterAll(wipeTestDb);

test("un membre voit le classement des équipes sur la page du club", async ({ browser }) => {
  const p = await login(browser, "parieur1");
  await p.goto(`/clubs/${lyonId}`);
  await expect(p.getByTestId("club-header")).toBeVisible();
  await p.getByTestId("section-standings").locator("summary").click();
  await expect(p.getByTestId("team-standings")).toBeVisible();
  const { n, sum } = await playedCells(p, "team-standings");
  expect(n).toBe(teams);
  expect(sum).toBe(played);
  await expect(p.getByTestId("team-standings")).toContainText("Victoire 3 points, nul 1, défaite 0");
  await checkPage(p);
  await p.context().close();
});

test("« Résultats des clubs » montre le classement du club choisi", async ({ browser }) => {
  const p = await login(browser, "parieur1");
  await p.goto(`/resultats-clubs?club=${lyonId}`);
  await p.getByTestId("results-standings").locator("summary").click();
  const { n } = await playedCells(p, "results-standings");
  expect(n).toBe(teams);
  await p.context().close();
});

test("page publique : classement visible sans compte quand la page est activée", async ({ browser }) => {
  await queryTestDb(`UPDATE "Club" SET "publicPage" = true, slug = 'tc-demo-lyon' WHERE id = '${lyonId}'`);
  const p = await (await browser.newContext()).newPage();
  await p.goto("/c/tc-demo-lyon");
  await expect(p.getByTestId("public-standings")).toBeVisible();
  expect((await playedCells(p, "public-standings")).n).toBe(teams);
  await p.context().close();
});
