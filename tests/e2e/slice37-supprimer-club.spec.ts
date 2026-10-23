import { type Browser, type Page, expect, test } from "@playwright/test";
import { checkPage, queryTestDb, seedDemoOnTestDb, signIn, wipeTestDb } from "./helpers";

// Suppression d'un club : lien discret en bas de la fiche (admins), encart avec « SUPPRIMER » à saisir, puis « Oui ».
// Charge la vraie démo : admin_bordeaux administre TC Démo-Bordeaux (club vide), parieur1 est simple membre de Lyon.

test.describe.configure({ mode: "serial" });

const PASSWORD = "Demo-ralli-2026!";
let bordeauxId: string;
let lyonId: string;

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
  bordeauxId = (await queryTestDb<{ id: string }>(`SELECT id FROM "Club" WHERE name = 'TC Démo-Bordeaux'`))[0]!.id;
  lyonId = (await queryTestDb<{ id: string }>(`SELECT id FROM "Club" WHERE name = 'TC Démo-Lyon'`))[0]!.id;
});
test.afterAll(wipeTestDb);

test("un simple membre ne voit pas « Supprimer le club »", async ({ browser }) => {
  const p = await login(browser, "parieur1");
  await p.goto(`/clubs/${lyonId}/fiche`);
  await expect(p.getByText("Fiche du club").first()).toBeVisible();
  await expect(p.getByTestId("delete-club-open")).toHaveCount(0);
  await p.context().close();
});

test("l'admin doit saisir SUPPRIMER en majuscules ; « Non » abandonne ; « Oui » supprime le club partout", async ({ browser }) => {
  const p = await login(browser, "admin_bordeaux");
  await p.goto(`/clubs/${bordeauxId}/fiche`);
  const open = p.getByTestId("delete-club-open");
  await expect(open).toHaveText("Supprimer le club");
  await checkPage(p, "fiche-supprimer-bas");
  await open.click();
  const dialog = p.getByTestId("delete-club-dialog");
  const yes = p.getByTestId("delete-club-yes");
  const input = p.getByTestId("delete-club-input");
  await expect(dialog).toBeVisible();
  await expect(yes).toBeDisabled();
  // Minuscules, mot incomplet ou espace en trop : « Oui » reste grisé.
  for (const typed of ["supprimer", "SUPPRIME", "SUPPRIMER "]) {
    await input.fill(typed);
    await expect(yes).toBeDisabled();
  }
  // « Non » ferme l'encart et efface la saisie ; le club existe toujours.
  await p.getByTestId("delete-club-no").click();
  await expect(dialog).toBeHidden();
  expect((await queryTestDb(`SELECT 1 FROM "Club" WHERE id = '${bordeauxId}' AND "deletedAt" IS NULL`)).length).toBe(1);
  await open.click();
  await expect(input).toHaveValue("");
  await input.fill("SUPPRIMER");
  await expect(yes).toBeEnabled();
  await yes.click();
  await expect(p).toHaveURL(/\/clubs$/);
  expect((await queryTestDb(`SELECT 1 FROM "Club" WHERE id = '${bordeauxId}' AND "deletedAt" IS NOT NULL`)).length).toBe(1);
  // Le club n'existe plus : ni page, ni fiche, ni recherche.
  await p.goto(`/clubs/${bordeauxId}`);
  await expect(p.getByRole("heading", { name: "Page introuvable" })).toBeVisible();
  await p.goto("/clubs/recherche?q=Bordeaux");
  await expect(p.getByText("Aucun club ne correspond à cette recherche.")).toBeVisible();
  await p.context().close();
});
