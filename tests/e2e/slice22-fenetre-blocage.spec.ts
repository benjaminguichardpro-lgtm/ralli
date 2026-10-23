import { type Browser, type Page, expect, test } from "@playwright/test";
import { checkPage, queryTestDb, seedDemoOnTestDb, signIn, wipeTestDb } from "./helpers";

// Un compte qui ne peut pas pronostiquer (admin, capitaine, joueur aligné) touche une cote : une fenêtre explique pourquoi.
// Charge la vraie démo : admin_lyon, capitaine_lyon, joueur_lyon (aligné dans la rencontre ouverte) et parieur1 (simple membre).

test.describe.configure({ mode: "serial" });

const PASSWORD = "Demo-ralli-2026!";
let openId: string, lockedId: string;

const newPage = async (b: Browser) => (await b.newContext()).newPage();

async function login(b: Browser, pseudo: string): Promise<Page> {
  const page = await newPage(b);
  await signIn(page, pseudo, PASSWORD, pseudo);
  await expect(page.getByTestId("nav-user")).toHaveText(pseudo);
  const popup = page.getByTestId("daily-bonus");
  if (await popup.waitFor({ timeout: 5000 }).then(() => true, () => false)) await popup.getByRole("button", { name: "Super" }).click();
  await expect(popup).toBeHidden();
  return page;
}

test.beforeAll(async () => {
  test.setTimeout(300_000);
  seedDemoOnTestDb();
  const rows = await queryTestDb<{ id: string; status: string; started: boolean }>(
    `SELECT e.id, e.status, e."startsAt" < now() AS started FROM "Encounter" e JOIN "Club" c ON c.id = e."organizerClubId"
      WHERE c.name = 'TC Démo-Lyon' ORDER BY e."startsAt" DESC`,
  );
  openId = rows.find((r) => r.status === "OPEN" && !r.started)!.id;
  lockedId = rows.find((r) => r.status === "OPEN" && r.started)!.id;
});
test.afterAll(async () => {
  await wipeTestDb();
});

const CASES: [string, string][] = [
  ["admin_lyon", "Les admins ne peuvent pas pronostiquer les matchs de leurs clubs."],
  ["capitaine_lyon", "Un capitaine ne peut pas pronostiquer la rencontre de son équipe."],
  ["joueur_lyon", "Vous êtes aligné dans cette rencontre : vous ne pouvez pas la pronostiquer."],
];

for (const [pseudo, message] of CASES) {
  test(`${pseudo} : toucher une cote ouvre la fenêtre « ${message.slice(0, 28)}… », et rien ne se passe d'autre`, async ({ browser }) => {
    const p = await login(browser, pseudo);
    await p.goto(`/rencontres/${openId}`);
    await p.waitForLoadState("networkidle");
    const odds = p.getByTestId("blocked-odd");
    expect(await odds.count(), "les deux cotes de chaque match sont touchables").toBeGreaterThanOrEqual(2);
    expect((await odds.count()) % 2).toBe(0);
    // La note sous les cotes reste affichée, avec le même texte.
    await expect(p.getByTestId("blocked").first()).toHaveText(message);
    await expect(p.getByTestId("predict")).toHaveCount(0);
    await expect(p.getByTestId("blocked-dialog").first()).toBeHidden();

    // Première cote du premier match, puis la dernière cote du dernier match : n'importe laquelle ouvre la fenêtre.
    await odds.first().click();
    const dialog = p.locator('dialog[open][data-testid="blocked-dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId("blocked-dialog-text")).toHaveText(message);
    await expect(dialog.getByRole("button", { name: "J'ai compris" })).toBeVisible();
    expect((await dialog.getByRole("button", { name: "J'ai compris" }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await checkPage(p, `220-fenetre-${pseudo}`);
    await dialog.getByRole("button", { name: "J'ai compris" }).click();
    await expect(dialog).toHaveCount(0);

    await odds.last().click();
    await expect(dialog).toBeVisible();
    await p.keyboard.press("Escape"); // Échap ferme aussi
    await expect(dialog).toHaveCount(0);
    // Plus aucune fenêtre ouverte (les fenêtres fermées restent dans la page, invisibles).
    await expect(p.locator("dialog[open]")).toHaveCount(0);
  });
}

test("un simple membre n'a pas cette fenêtre : toucher une cote ouvre le panneau de pronostic", async ({ browser }) => {
  const p = await login(browser, "parieur1");
  await p.goto(`/rencontres/${openId}`);
  await p.waitForLoadState("networkidle");
  await expect(p.getByTestId("blocked-odd")).toHaveCount(0);
  await expect(p.getByTestId("blocked")).toHaveCount(0);
  await p.getByTestId("predict").first().getByRole("button").first().click();
  await expect(p.locator('dialog[open]').getByText("Valider mon ralli")).toBeVisible();
  await expect(p.getByTestId("blocked-dialog")).toHaveCount(0);
});

test("pronostics fermés : l'admin ne voit aucune fenêtre (les cotes ne sont pas touchables)", async ({ browser }) => {
  const p = await login(browser, "admin_lyon");
  await p.goto(`/rencontres/${lockedId}`);
  await p.waitForLoadState("networkidle");
  await expect(p.getByTestId("blocked-odd")).toHaveCount(0);
  await expect(p.getByTestId("blocked-dialog")).toHaveCount(0);
});
