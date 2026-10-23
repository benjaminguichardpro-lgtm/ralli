import { type Browser, type Page, expect, test } from "@playwright/test";
import { checkPage, queryTestDb, seedDemoOnTestDb, signIn, wipeTestDb } from "./helpers";

// Profil d'un membre depuis le classement : clubs en commun seulement, profil masqué, inconnu. Charge la vraie démo :
// parieur4 est membre de Lyon seulement ; parieur1 et parieur2 sont membres de Lyon et de Nantes ; admin_nantes n'est pas à Lyon.

test.describe.configure({ mode: "serial" });

const PASSWORD = "Demo-ralli-2026!";
let lyonId: string;

const idOf = async (pseudo: string) => (await queryTestDb<{ id: string }>(`SELECT id FROM "User" WHERE "displayName" = '${pseudo}'`))[0]!.id;

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

test.beforeAll(async () => {
  test.setTimeout(300_000);
  await wipeTestDb();
  seedDemoOnTestDb();
  lyonId = (await queryTestDb<{ id: string }>(`SELECT id FROM "Club" WHERE name = 'TC Démo-Lyon'`))[0]!.id;
});
test.afterAll(wipeTestDb);

test("du classement au profil d'un membre : clubs en commun seulement, jamais de pronostic en cours", async ({ browser }) => {
  const p = await login(browser, "parieur4");
  await p.goto(`/clubs/${lyonId}/classement`);
  await p.getByTestId("leaderboard-profile-link").filter({ hasText: /^parieur1$/ }).click();
  await expect(p).toHaveURL(/\/membres\//);
  await expect(p.getByTestId("member-name")).toHaveText("parieur1");
  // parieur1 est aussi à Nantes, mais parieur4 n'y est pas : seul Lyon est un club en commun.
  await expect(p.getByTestId("member-clubs")).toContainText("TC Démo-Lyon");
  await expect(p.locator("main")).not.toContainText("Nantes");
  await expect(p.getByTestId("member-stats")).toBeVisible();
  await expect(p.getByTestId("member-settled")).toBeVisible();
  expect(await p.getByTestId("member-result").count()).toBeGreaterThan(0);
  const statuses = await p.getByTestId("member-result").evaluateAll((els) => els.map((e) => e.getAttribute("data-status")));
  for (const s of statuses) expect(["WON", "LOST", "REFUNDED"]).toContain(s);
  await checkPage(p, "profil-membre");
  // Son propre pseudo mène à « Mon profil ».
  await p.goto(`/clubs/${lyonId}`);
  await p.getByTestId("section-members").locator("summary").click();
  await p.getByTestId("member-profile-link").filter({ hasText: /^parieur4$/ }).click();
  await expect(p).toHaveURL(/\/profil$/);
  await p.context().close();
});

test("un membre sans club en commun : page introuvable", async ({ browser }) => {
  const p = await login(browser, "parieur4");
  await p.goto(`/membres/${await idOf("admin_nantes")}`);
  await expect(p.getByRole("heading", { name: "Page introuvable" })).toBeVisible();
  await p.goto("/membres/inconnu");
  await expect(p.getByRole("heading", { name: "Page introuvable" })).toBeVisible();
  await p.context().close();
});

test("un membre masque son profil : les autres ne voient que son avatar, son pseudo et les clubs en commun", async ({ browser }) => {
  const owner = await login(browser, "parieur2");
  await owner.goto("/profil");
  await owner.waitForLoadState("networkidle");
  await expect(owner.getByTestId("profile-visibility-state")).toContainText("peuvent voir ton profil");
  await owner.getByRole("button", { name: "Masquer mon profil" }).click();
  await expect(owner.getByTestId("profile-visibility-state")).toContainText("masqué");

  const viewer = await login(browser, "parieur4");
  await viewer.goto(`/membres/${await idOf("parieur2")}`);
  await expect(viewer.getByTestId("member-name")).toHaveText("parieur2");
  await expect(viewer.getByTestId("member-hidden")).toBeVisible();
  await expect(viewer.getByTestId("member-stats")).toHaveCount(0);
  await expect(viewer.getByTestId("member-results")).toHaveCount(0);

  await owner.getByRole("button", { name: "Rendre mon profil visible" }).click();
  await expect(owner.getByTestId("profile-visibility-state")).toContainText("peuvent voir ton profil");
  await viewer.reload();
  await expect(viewer.getByTestId("member-stats")).toBeVisible();
  await owner.context().close();
  await viewer.context().close();
});
