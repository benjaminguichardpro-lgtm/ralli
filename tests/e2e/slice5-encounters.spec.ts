import { type Browser, type Page, expect, test } from "@playwright/test";
import { checkPage, openSection, currentClubId, joinClubById, signUp, allowClubCreation } from "./helpers";

// Ivan (admin), Jade (capitaine de Messieurs 1), Kevin (simple membre), un visiteur sans compte.

test.describe.configure({ mode: "serial" });

let ivan: Page, jade: Page, kevin: Page, anon: Page;
let clubUrl: string, encounterUrl: string;

async function newPage(browser: Browser) {
  return (await browser.newContext()).newPage();
}

async function register(page: Page, name: string) {
  await signUp(page, name);
  await expect(page.getByTestId("nav-user")).toHaveText(name);
}

async function addPlayer(page: Page, first: string, last: string, rank: string) {
  const form = page.getByTestId("add-player");
  await form.getByLabel("Prénom").fill(first);
  await form.getByLabel("Nom", { exact: true }).fill(last);
  await form.getByLabel("Niveau FFT").selectOption({ label: rank });
  await form.getByRole("button", { name: "Ajouter le joueur" }).click();
  await expect(form.getByText(`${first} ${last} ajouté(e) à l'équipe.`)).toBeVisible();
}

async function addMatch(page: Page, home: string, away: string) {
  const add = page.getByTestId("add-match");
  if ((await add.evaluate((el) => el.tagName)) === "DETAILS" && !(await add.getAttribute("open"))) await add.locator("summary").click();
  await add.getByLabel("Joueur domicile").selectOption({ label: home });
  await add.getByLabel("Joueur extérieur").selectOption({ label: away });
  await add.getByRole("button", { name: "Ajouter le match" }).click();
}

test.beforeAll(async ({ browser }) => {
  [ivan, jade, kevin, anon] = await Promise.all([newPage(browser), newPage(browser), newPage(browser), newPage(browser)]);
});

test("mise en place : club, équipe de Jade, adversaire et joueurs", async () => {
  await register(ivan, "Ivan");
  await allowClubCreation();
  await ivan.goto("/clubs/nouveau");
  await ivan.getByLabel("Nom du club").fill("TC Rencontres");
  await ivan.getByRole("button", { name: "Créer le club" }).click();
  const code = await currentClubId(ivan);
  clubUrl = ivan.url();
  for (const [page, name] of [[jade, "Jade"], [kevin, "Kevin"]] as const) {
    await register(page, name);
    await joinClubById(page, code);
    await expect(page.getByText(/Votre rôle/)).toBeVisible();
  }
  await ivan.goto(clubUrl);
  await openSection(ivan, "Équipes du club");
  await ivan.getByText("Créer une équipe").click();
  await ivan.getByLabel("Nom de l'équipe", { exact: true }).fill("Messieurs 1");
  await ivan.getByLabel("Capitaine").selectOption({ label: "Jade" });
  await ivan.getByRole("button", { name: "Créer l'équipe" }).click();
  await addPlayer(ivan, "Léa", "Martin", "30");
  await addPlayer(ivan, "Hugo", "Durand", "30/1");
  await ivan.goto(clubUrl);
  await openSection(ivan, "Équipes adverses");
  await ivan.getByText("Ajouter une équipe adverse").click();
  await ivan.getByLabel("Club adverse").fill("TC Voisin");
  await ivan.getByLabel("Nom de l'équipe adverse").fill("TC Voisin 1");
  await ivan.getByRole("button", { name: "Ajouter l'équipe adverse" }).click();
  await addPlayer(ivan, "Paul", "Voisin", "30/1");
  await addPlayer(ivan, "Marc", "Lenoir", "30/2");
  await addPlayer(ivan, "Yann", "Roux", "15/5");
});

test("Kevin (membre) ne peut pas créer de rencontre", async () => {
  await kevin.goto(clubUrl);
  await expect(kevin.getByRole("link", { name: "Nouvelle rencontre" })).toHaveCount(0);
  await kevin.goto(`${clubUrl}/rencontres/nouvelle`);
  await expect(kevin.getByText("Seuls les capitaines et les admins du club créent des rencontres")).toBeVisible();
});

test("Jade crée un brouillon : adversaire de la liste, domicile, date en heure de Paris", async () => {
  await jade.goto(clubUrl);
  await jade.getByRole("link", { name: "Nouvelle rencontre" }).click();
  await jade.getByRole("button", { name: "Créer le brouillon" }).click();
  await expect(jade.getByText("Choisissez l'adversaire")).toBeVisible();

  await jade.getByLabel("Adversaire").selectOption({ label: "TC Voisin 1" });
  await jade.getByLabel("Votre équipe reçoit (domicile)").check();
  await jade.getByLabel("Date et heure de début").fill("2027-03-14T14:00");
  await checkPage(jade, "20-nouvelle-rencontre");
  await jade.getByRole("button", { name: "Créer le brouillon" }).click();

  await expect(jade.getByText("Brouillon", { exact: true })).toBeVisible();
  await expect(jade.getByRole("heading", { level: 1 })).toContainText("TC Rencontres · Messieurs 1");
  await expect(jade.getByRole("heading", { level: 1 })).toContainText("TC Voisin 1");
  await expect(jade.getByTestId("starts-at")).toHaveText("dimanche 14 mars 2027 à 14:00");
  encounterUrl = jade.url();
});

test("brouillon invisible pour un membre et un visiteur", async () => {
  await kevin.goto(encounterUrl);
  await expect(kevin.getByRole("heading", { name: "Page introuvable" })).toBeVisible();
  await anon.goto(encounterUrl);
  await expect(anon.getByRole("heading", { name: "Page introuvable" })).toBeVisible();
});

test("Jade compose : un seul simple par joueur", async () => {
  await jade.goto(encounterUrl);
  await addMatch(jade, "Léa Martin (30)", "Paul Voisin (30/1)");
  await expect(jade.getByTestId("matches").locator("li")).toHaveCount(1);
  await addMatch(jade, "Léa Martin (30)", "Marc Lenoir (30/2)");
  await expect(jade.getByText("Ce joueur dispute déjà un simple dans cette rencontre")).toBeVisible();
  await addMatch(jade, "Hugo Durand (30/1)", "Marc Lenoir (30/2)");
  await expect(jade.getByTestId("matches").locator("li")).toHaveCount(2);
  await expect(jade.getByText("Les cotes seront calculées à la publication.")).toBeVisible();
  await checkPage(jade, "21-brouillon-compose");
});

test("publication : confirmation, cotes figées et affichées", async () => {
  jade.once("dialog", (d) => void d.accept());
  await jade.getByRole("button", { name: "Publier la rencontre" }).click();
  await expect(jade.getByText("Pronostics ouverts", { exact: true })).toBeVisible();
  const odds = jade.getByTestId("odds");
  await expect(odds).toHaveText(["1,56", "2,78", "1,56", "2,78"]);
  await checkPage(jade, "22-rencontre-publiee-capitaine");
});

test("page publique : visible sans compte, « Prénom Nom », non indexée, sans gestion", async () => {
  await anon.goto(encounterUrl);
  await expect(anon.getByText("Pronostics ouverts", { exact: true })).toBeVisible();
  const matches = anon.getByTestId("matches");
  await expect(matches).toContainText("Léa Martin");
  await expect(matches).toContainText("Paul Voisin");
  await expect(anon.getByTestId("manage")).toHaveCount(0);
  await expect(anon.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  expect(encounterUrl).toMatch(/\/rencontres\/c[a-z0-9]{20,}$/);
  await checkPage(anon, "23-rencontre-publique");
});

test("Kevin voit la rencontre dans le club et sur l'accueil, sans gestion", async () => {
  await kevin.goto(clubUrl);
  await expect(kevin.getByTestId("encounter-list")).toContainText("TC Voisin 1");
  await kevin.goto("/");
  await expect(kevin.getByTestId("feed")).toContainText("TC Voisin 1");
  await expect(kevin.getByTestId("next-encounter")).toBeVisible();
  await kevin.goto(encounterUrl);
  await expect(kevin.getByTestId("manage")).toHaveCount(0);
});

test("après publication : modifier un match (confirmation), puis reporter", async () => {
  await jade.goto(encounterUrl);
  const second = jade.getByTestId("manage").locator("details").filter({ hasText: "Modifier le simple 2" });
  await second.locator("summary").click();
  await second.getByLabel("Joueur extérieur").selectOption({ label: "Yann Roux (15/5)" });
  let asked = "";
  jade.once("dialog", (d) => {
    asked = d.message();
    void d.accept();
  });
  await second.getByRole("button", { name: "Enregistrer le match" }).click();
  await expect(jade.getByTestId("matches")).toContainText("Yann Roux");
  expect(asked).toContain("Les pronostics déjà faits sur ce match seront remboursés.");
  await expect(jade.getByTestId("matches").locator("li")).toHaveCount(2);
  await expect(jade.getByTestId("matches")).toContainText("Simple 2");

  const resched = jade.getByTestId("manage").locator("details").filter({ hasText: "Reporter" });
  await resched.locator("summary").click();
  await resched.getByLabel("Nouvelle date et heure").fill("2027-03-21T15:30");
  await resched.getByRole("button", { name: "Reporter" }).click();
  await expect(jade.getByTestId("starts-at")).toHaveText("dimanche 21 mars 2027 à 15:30");
});

test("Ivan (admin) annule avec un motif", async () => {
  await ivan.goto(encounterUrl);
  const cancel = ivan.getByTestId("manage").locator("details").filter({ hasText: "Annuler la rencontre" });
  await cancel.locator("summary").click();
  await cancel.getByLabel("Motif (facultatif)").fill("Courts inondés");
  ivan.once("dialog", (d) => void d.accept());
  await cancel.getByRole("button", { name: "Annuler la rencontre" }).click();
  await expect(ivan.getByText("Annulée", { exact: true })).toBeVisible();
  await expect(ivan.getByRole("button", { name: "Annuler la rencontre" })).toHaveCount(0);
  await checkPage(ivan, "24-rencontre-annulee");
});

test("un brouillon peut être supprimé", async () => {
  await jade.goto(`${clubUrl}/rencontres/nouvelle`);
  await jade.getByLabel("Adversaire").selectOption({ label: "TC Voisin 1" });
  await jade.getByLabel("Votre équipe se déplace (extérieur)").check();
  await jade.getByLabel("Date et heure de début").fill("2027-04-04T10:00");
  await jade.getByRole("button", { name: "Créer le brouillon" }).click();
  await expect(jade.getByRole("heading", { level: 1 })).toContainText("TC Voisin 1");
  // L'équipe adverse est à domicile : elle apparaît en premier.
  await expect(jade.getByRole("heading", { level: 1 }).locator("span").first()).toHaveText("TC Voisin 1");
  jade.once("dialog", (d) => void d.accept());
  await jade.getByRole("button", { name: "Supprimer le brouillon" }).click();
  await expect(jade).toHaveURL(clubUrl);
});
