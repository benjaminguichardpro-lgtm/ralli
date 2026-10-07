import { readFileSync } from "node:fs";
import { type Browser, type Page, expect, test } from "@playwright/test";
import { parse } from "dotenv";
import { checkPage, signUp } from "./helpers";

// Odile (admin), Pablo (capitaine), Quentin (membre), Rita (sans club), un visiteur sans compte.

test.describe.configure({ mode: "serial" });

let ivan: Page, jade: Page, kevin: Page, nina: Page, anon: Page;
let clubUrl: string, encounterUrl: string;
const cronSecret = parse(readFileSync(".env.test")).CRON_SECRET!;

const newPage = async (b: Browser) => (await b.newContext()).newPage();

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
  await add.getByLabel("Joueur domicile").selectOption({ label: home });
  await add.getByLabel("Joueur extérieur").selectOption({ label: away });
  await add.getByRole("button", { name: "Ajouter le match" }).click();
}

const balance = (page: Page) => page.getByTestId("balance");

async function predict(page: Page, matchIndex: number, pick: RegExp, aces: string) {
  const area = page.getByTestId("matches").locator("li").nth(matchIndex).getByTestId("predict");
  if (!(await area.evaluate((el) => (el as HTMLDetailsElement).open))) await area.locator("summary").click();
  await area.getByLabel(pick).check();
  await area.getByLabel("Aces engagés").fill(aces);
  await area.getByRole("button", { name: "Valider mon pronostic" }).click();
}

test.beforeAll(async ({ browser }) => {
  [ivan, jade, kevin, nina, anon] = await Promise.all([newPage(browser), newPage(browser), newPage(browser), newPage(browser), newPage(browser)]);
});

test("mise en place : club, rencontre publiée avec deux simples", async () => {
  await register(ivan, "Odile");
  await ivan.goto("/clubs/nouveau");
  await ivan.getByLabel("Nom du club").fill("TC Pronostics");
  await ivan.getByRole("button", { name: "Créer le club" }).click();
  const code = (await ivan.getByTestId("invite-code").innerText()).trim();
  clubUrl = ivan.url();
  for (const [page, name] of [[jade, "Pablo"], [kevin, "Quentin"]] as const) {
    await register(page, name);
    await page.goto("/clubs/rejoindre");
    await page.getByLabel("Code d'invitation").fill(code);
    await page.getByRole("button", { name: "Rejoindre" }).click();
    await expect(page.getByText(/Votre rôle/)).toBeVisible();
  }
  await register(nina, "Rita");
  await ivan.goto(clubUrl);
  await ivan.getByText("Créer une équipe").click();
  await ivan.getByLabel("Nom de l'équipe", { exact: true }).fill("Messieurs 1");
  await ivan.getByLabel("Capitaine").selectOption({ label: "Pablo" });
  await ivan.getByRole("button", { name: "Créer l'équipe" }).click();
  await addPlayer(ivan, "Léa", "Martin", "30");
  await addPlayer(ivan, "Hugo", "Durand", "30/1");
  await ivan.goto(clubUrl);
  await ivan.getByText("Ajouter une équipe adverse").click();
  await ivan.getByLabel("Club adverse").fill("TC Voisin");
  await ivan.getByLabel("Nom de l'équipe adverse").fill("TC Voisin 1");
  await ivan.getByRole("button", { name: "Ajouter l'équipe adverse" }).click();
  await addPlayer(ivan, "Paul", "Voisin", "30/1");
  await addPlayer(ivan, "Marc", "Lenoir", "30/2");

  await jade.goto(`${clubUrl}/rencontres/nouvelle`);
  await jade.getByLabel("Adversaire").selectOption({ label: "TC Voisin 1" });
  await jade.getByLabel("Date et heure de début").fill("2027-03-14T14:00");
  await jade.getByRole("button", { name: "Créer le brouillon" }).click();
  await expect(jade.getByText("Brouillon", { exact: true })).toBeVisible();
  encounterUrl = jade.url();
  await addMatch(jade, "Léa Martin (30)", "Paul Voisin (30/1)");
  await expect(jade.getByTestId("matches").locator("li")).toHaveCount(1);
  await addMatch(jade, "Hugo Durand (30/1)", "Marc Lenoir (30/2)");
  await expect(jade.getByTestId("matches").locator("li")).toHaveCount(2);
  jade.once("dialog", (d) => void d.accept());
  await jade.getByRole("button", { name: "Publier la rencontre" }).click();
  await expect(jade.getByText("Pronostics ouverts", { exact: true })).toBeVisible();
});

test("Kevin pronostique : validations de formulaire puis succès, solde débité", async () => {
  await kevin.goto("/");
  await expect(balance(kevin)).toHaveText("1 000 Aces");
  await kevin.goto(encounterUrl);
  const area = kevin.getByTestId("matches").locator("li").first().getByTestId("predict");
  await area.locator("summary").click();
  await checkPage(kevin, "30-pronostic-formulaire");

  await area.getByRole("button", { name: "Valider mon pronostic" }).click();
  await expect(area.getByText("Choisissez un joueur")).toBeVisible();
  await area.getByLabel(/Léa M\. gagne/).check();
  await area.getByLabel("Aces engagés").fill("5");
  await area.getByRole("button", { name: "Valider mon pronostic" }).click();
  await expect(area.getByText("Minimum 10 Aces")).toBeVisible();
  // React remet les champs à leur valeur une fois l'action terminée : on laisse ce reset passer avant de ressaisir.
  await expect(area.getByLabel("Aces engagés")).toHaveValue("5");
  await kevin.waitForTimeout(500);
  await area.getByLabel("Aces engagés").fill("5000");
  await expect(area.getByLabel("Aces engagés")).toHaveValue("5000");
  await area.getByRole("button", { name: "Valider mon pronostic" }).click();
  await expect(area.getByText(/Solde insuffisant/)).toBeVisible();

  await predict(kevin, 0, /Paul V\. gagne/, "300");
  const mine = kevin.getByTestId("my-prediction");
  await expect(mine).toContainText("Paul V.");
  await expect(mine).toContainText("300 Aces engagés à la cote 2,78");
  await expect(mine).toContainText("En attente du résultat.");
  // Définitif : plus de formulaire sur ce match, encore un sur l'autre.
  await expect(kevin.getByTestId("predict")).toHaveCount(1);
  await checkPage(kevin, "31-pronostic-enregistre");
});

test("portefeuille de Kevin : solde, en attente, historique", async () => {
  await kevin.getByRole("link", { name: "Portefeuille" }).click();
  await expect(balance(kevin)).toHaveText("700 Aces");
  await expect(kevin.getByTestId("pending-aces")).toContainText("300 Aces");
  await expect(kevin.getByTestId("pending")).toContainText("Léa M. contre Paul V.");
  await expect(kevin.getByTestId("ledger").locator("li")).toHaveText([/Aces engagés[\s\S]*-300 Aces/, /Bonus d'inscription[\s\S]*\+1\s000 Aces/]);
  await checkPage(kevin, "32-portefeuille");
});

test("anti-trucage : admin et capitaine voient le motif, pas de formulaire", async () => {
  for (const [page, motif] of [[ivan, /admins du club ne peuvent pas/], [jade, /capitaine ne peut pas/]] as const) {
    await page.goto(encounterUrl);
    await expect(page.getByTestId("predict")).toHaveCount(0);
    await expect(page.getByTestId("blocked")).toHaveCount(2);
    await expect(page.getByTestId("blocked").first()).toHaveText(motif);
  }
});

test("visiteur et non-membre : invitation à se connecter, ou réservé aux membres", async () => {
  await anon.goto(encounterUrl);
  await expect(anon.getByRole("link", { name: "Connectez-vous" })).toHaveCount(2);
  await expect(anon.getByTestId("predict")).toHaveCount(0);
  await nina.goto(encounterUrl);
  await expect(nina.getByText("Réservé aux membres du club organisateur.")).toHaveCount(2);
  await expect(nina.getByTestId("predict")).toHaveCount(0);
  await anon.goto("/portefeuille");
  await expect(anon).toHaveURL(/\/connexion/);
});

test("bonus du lundi : route fermée sans secret, ouverte avec, idempotente", async () => {
  const res = anon.request;
  expect((await res.get("/api/cron/weekly-bonus")).status()).toBe(401);
  expect((await res.get("/api/cron/weekly-bonus", { headers: { authorization: "Bearer mauvais" } })).status()).toBe(401);
  const ok = await res.get("/api/cron/weekly-bonus", { headers: { authorization: `Bearer ${cronSecret}` } });
  expect(ok.status()).toBe(200);
  // Aucun solde sous 500 : personne n'est crédité.
  expect(await ok.json()).toMatchObject({ granted: 0 });
});

test("Ivan annule la rencontre : Kevin est remboursé et le voit dans son historique", async () => {
  await ivan.goto(encounterUrl);
  const cancel = ivan.getByTestId("manage").locator("details").filter({ hasText: "Annuler la rencontre" });
  await cancel.locator("summary").click();
  ivan.once("dialog", (d) => void d.accept());
  await cancel.getByRole("button", { name: "Annuler la rencontre" }).click();
  await expect(ivan.getByText("Annulée", { exact: true })).toBeVisible();

  await kevin.goto("/portefeuille");
  await expect(balance(kevin)).toHaveText("1 000 Aces");
  await expect(kevin.getByTestId("pending")).toHaveCount(0);
  await expect(kevin.getByTestId("ledger").locator("li").first()).toContainText("Remboursement");
  await kevin.goto(encounterUrl);
  await expect(kevin.getByTestId("my-prediction")).toContainText("Remboursé.");
  await expect(kevin.getByTestId("predict")).toHaveCount(0);
});
