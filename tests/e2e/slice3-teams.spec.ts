import { type Browser, type Page, expect, test } from "@playwright/test";
import { checkPage, signUp } from "./helpers";

// Scénario multi-rôles : Dora (admin), Éric (capitaine M1), Fanny (capitaine M2),
// Gaston (simple membre), Hélène (hors club).

test.describe.configure({ mode: "serial" });

let dora: Page, eric: Page, fanny: Page, gaston: Page;
let clubUrl: string, m1Url: string, m2Url: string;

async function newPage(browser: Browser) {
  return (await browser.newContext()).newPage();
}

async function register(page: Page, name: string) {
  await signUp(page, name);
  await expect(page.getByTestId("nav-user")).toHaveText(name);
}

async function joinClub(page: Page, code: string) {
  await page.goto("/clubs/rejoindre");
  await page.getByLabel("Code d'invitation").fill(code);
  await page.getByRole("button", { name: "Rejoindre" }).click();
  await expect(page.getByText(/Votre rôle/)).toBeVisible();
}

async function addPlayer(page: Page, first: string, last: string, rank: string) {
  const form = page.getByTestId("add-player");
  await form.getByLabel("Prénom").fill(first);
  await form.getByLabel("Nom", { exact: true }).fill(last);
  await form.getByLabel("Niveau FFT").selectOption({ label: rank });
  await form.getByRole("button", { name: "Ajouter le joueur" }).click();
  await expect(form.getByText(`${first} ${last} ajouté(e) à l'équipe.`)).toBeVisible();
}

const rosterRow = (page: Page, name: string) => page.getByTestId("roster").locator("li").filter({ hasText: name });

test.beforeAll(async ({ browser }) => {
  [dora, eric, fanny, gaston] = await Promise.all([newPage(browser), newPage(browser), newPage(browser), newPage(browser)]);
});

test("mise en place : Dora crée le club, les autres le rejoignent", async () => {
  await register(dora, "Dora");
  await dora.goto("/clubs/nouveau");
  await dora.getByLabel("Nom du club").fill("TC Équipes");
  await dora.getByRole("button", { name: "Créer le club" }).click();
  const code = (await dora.getByTestId("invite-code").innerText()).trim();
  clubUrl = dora.url();
  for (const [page, name] of [[eric, "Eric"], [fanny, "Fanny"], [gaston, "Gaston"]] as const) {
    await register(page, name);
    await joinClub(page, code);
  }
});

test("Dora crée deux équipes ; le capitaine est obligatoire", async () => {
  await dora.goto(clubUrl);
  await dora.getByText("Créer une équipe").click();
  await dora.getByLabel("Nom de l'équipe", { exact: true }).fill("Messieurs 1");
  await dora.getByRole("button", { name: "Créer l'équipe" }).click();
  await expect(dora.getByText("Choisissez un capitaine")).toBeVisible();

  await dora.getByLabel("Capitaine").selectOption({ label: "Eric" });
  await dora.getByRole("button", { name: "Créer l'équipe" }).click();
  await expect(dora.getByRole("heading", { name: "Messieurs 1" })).toBeVisible();
  await expect(dora.getByTestId("captain")).toHaveText("Eric");
  m1Url = dora.url();

  await dora.goto(clubUrl);
  await dora.getByText("Créer une équipe").click();
  await dora.getByLabel("Nom de l'équipe", { exact: true }).fill("Messieurs 2");
  await dora.getByLabel("Capitaine").selectOption({ label: "Fanny" });
  await dora.getByRole("button", { name: "Créer l'équipe" }).click();
  await expect(dora.getByRole("heading", { name: "Messieurs 2" })).toBeVisible();
  m2Url = dora.url();
  await dora.goto(clubUrl);
  await checkPage(dora, "10-club-equipes-admin");
});

test("Éric (capitaine M1) compose son effectif", async () => {
  await eric.goto(clubUrl);
  await expect(eric.getByText("Votre rôle : membre · capitaine")).toBeVisible();
  await eric.goto(m1Url);
  const form = eric.getByTestId("add-player");
  await form.getByRole("button", { name: "Ajouter le joueur" }).click();
  await expect(form.getByText("Prénom requis")).toBeVisible();

  await addPlayer(eric, "Léa", "Martin", "15/2");
  await addPlayer(eric, "Hugo", "Durand", "30/1");
  await addPlayer(eric, "Test", "Effacer", "NC");
  await expect(rosterRow(eric, "Léa Martin")).toContainText("15/2");
  await expect(rosterRow(eric, "Hugo Durand")).toContainText("30/1");
  await checkPage(eric, "11-equipe-capitaine");
});

test("Éric ne gère pas M2 ; Gaston (membre) ne gère rien", async () => {
  await eric.goto(m2Url);
  await expect(eric.getByRole("heading", { name: "Messieurs 2" })).toBeVisible();
  await expect(eric.getByTestId("add-player")).toHaveCount(0);

  await gaston.goto(m1Url);
  await expect(rosterRow(gaston, "Léa Martin")).toBeVisible();
  await expect(gaston.getByTestId("add-player")).toHaveCount(0);
  await expect(gaston.getByText(/^Gérer /)).toHaveCount(0);
  await expect(gaston.getByLabel("Capitaine")).toHaveCount(0);
  await gaston.goto(clubUrl);
  await expect(gaston.getByText("Créer une équipe")).toHaveCount(0);
  await expect(gaston.getByText("Ajouter une équipe adverse")).toHaveCount(0);
  await checkPage(gaston, "12-equipe-membre");
});

test("Fanny ajoute à M2 une joueuse déjà en M1", async () => {
  await fanny.goto(m2Url);
  await fanny.getByLabel("Joueur d'une autre équipe du club").selectOption({ label: "Léa Martin (15/2)" });
  await fanny.getByRole("button", { name: "Ajouter à l'équipe" }).click();
  await expect(rosterRow(fanny, "Léa Martin")).toBeVisible();
});

test("Éric lie Léa au compte de Gaston, corrige un niveau, retire et supprime", async () => {
  await eric.goto(m1Url);
  const lea = rosterRow(eric, "Léa Martin");
  await lea.getByText("Gérer Léa").click();
  await lea.getByLabel("Compte Ralli de ce joueur").selectOption({ label: "Gaston" });
  await lea.getByRole("button", { name: "Enregistrer le lien" }).click();
  await expect(rosterRow(eric, "Léa Martin")).toContainText("Compte : Gaston");

  const hugo = rosterRow(eric, "Hugo Durand");
  await hugo.getByText("Gérer Hugo").click();
  await hugo.getByLabel("Niveau FFT").selectOption({ label: "30" });
  await hugo.getByRole("button", { name: "Enregistrer la fiche" }).click();
  await expect(hugo.getByText("Fiche mise à jour.")).toBeVisible();
  await expect(rosterRow(eric, "Hugo Durand").getByTestId("rank")).toHaveText("30");

  // Retirer : annuler puis confirmer.
  let asked = "";
  eric.once("dialog", (d) => {
    asked = d.message();
    void d.dismiss();
  });
  await hugo.getByRole("button", { name: "Retirer Hugo Durand de l'équipe" }).click();
  expect(asked).toBe("Retirer Hugo Durand de cette équipe ?");
  await eric.reload();
  await expect(rosterRow(eric, "Hugo Durand")).toBeVisible();
  eric.once("dialog", (d) => void d.accept());
  const hugo2 = rosterRow(eric, "Hugo Durand");
  await hugo2.getByText("Gérer Hugo").click();
  await hugo2.getByRole("button", { name: "Retirer Hugo Durand de l'équipe" }).click();
  await expect(rosterRow(eric, "Hugo Durand")).toHaveCount(0);

  // Supprimer une fiche jamais alignée.
  const test1 = rosterRow(eric, "Test Effacer");
  await test1.getByText("Gérer Test").click();
  eric.once("dialog", (d) => void d.accept());
  await test1.getByRole("button", { name: "Supprimer la fiche de Test Effacer" }).click();
  await expect(rosterRow(eric, "Test Effacer")).toHaveCount(0);
});

test("Éric crée une équipe adverse (externe) et saisit ses joueurs, sans lien de compte", async () => {
  await eric.goto(clubUrl);
  await eric.getByText("Ajouter une équipe adverse").click();
  await eric.getByLabel("Club adverse").fill("TC Voisin");
  await eric.getByLabel("Nom de l'équipe adverse").fill("TC Voisin – Messieurs 1");
  await eric.getByRole("button", { name: "Ajouter l'équipe adverse" }).click();
  await expect(eric.getByRole("heading", { name: "TC Voisin – Messieurs 1" })).toBeVisible();
  await expect(eric.getByText("Équipe adverse · TC Voisin (hors Ralli)")).toBeVisible();
  await addPlayer(eric, "Paul", "Voisin", "15/4");
  const paul = rosterRow(eric, "Paul Voisin");
  await paul.getByText("Gérer Paul").click();
  await expect(paul.getByLabel("Compte Ralli de ce joueur")).toHaveCount(0);
  await checkPage(eric, "13-equipe-externe");
});

test("Hélène (hors club) ne voit pas l'équipe", async ({ browser }) => {
  const helene = await newPage(browser);
  await register(helene, "Helene");
  await helene.goto(m1Url);
  await expect(helene.getByRole("heading", { name: "Page introuvable" })).toBeVisible();
  await expect(helene.getByText("Léa")).toHaveCount(0);
});

test("Dora change le capitaine de M1 : Éric perd la gestion", async () => {
  await dora.goto(m1Url);
  await dora.getByLabel("Capitaine").selectOption({ label: "Gaston" });
  await dora.getByRole("button", { name: "Changer de capitaine" }).click();
  await expect(dora.getByText("Capitaine mis à jour.")).toBeVisible();
  await expect(dora.getByTestId("captain")).toHaveText("Gaston");

  await eric.goto(m1Url);
  await expect(eric.getByTestId("add-player")).toHaveCount(0);
  await gaston.goto(m1Url);
  await expect(gaston.getByTestId("add-player")).toBeVisible();
});
