import { readFileSync } from "node:fs";
import { type Browser, type Page, expect, test } from "@playwright/test";
import { parse } from "dotenv";
import { checkPage, openSection, currentClubId, joinClubById, signUp, allowClubCreation } from "./helpers";

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

test.beforeAll(async ({ browser }) => {
  [ivan, jade, kevin, nina, anon] = await Promise.all([newPage(browser), newPage(browser), newPage(browser), newPage(browser), newPage(browser)]);
});

test("mise en place : club, rencontre publiée avec deux simples", async () => {
  await register(ivan, "Odile");
  await allowClubCreation();
  await ivan.goto("/clubs/nouveau");
  await ivan.getByLabel("Nom du club").fill("TC Pronostics");
  await ivan.getByRole("button", { name: "Créer le club" }).click();
  const code = await currentClubId(ivan);
  clubUrl = ivan.url();
  for (const [page, name] of [[jade, "Pablo"], [kevin, "Quentin"]] as const) {
    await register(page, name);
    await joinClubById(page, code);
    await expect(page.getByText(/Votre rôle/)).toBeVisible();
  }
  await register(nina, "Rita");
  await ivan.goto(clubUrl);
  await openSection(ivan, "Équipes du club");
  await ivan.getByText("Créer une équipe").click();
  await ivan.getByLabel("Nom de l'équipe", { exact: true }).fill("Messieurs 1");
  await ivan.getByLabel("Capitaine").selectOption({ label: "Pablo" });
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

test("Kevin pronostique : validations dans le panneau, récapitulatif, puis succès, solde débité", async () => {
  await kevin.goto("/");
  await expect(balance(kevin)).toHaveText("1 000 Aces");
  await kevin.goto(encounterUrl);
  const match1 = kevin.getByTestId("matches").locator("li").first();
  await match1.getByRole("button", { name: /Paul V\. gagne/ }).click();
  const sheet = kevin.getByRole("dialog", { name: "Votre pronostic" });
  await expect(sheet.getByTestId("sheet-odds")).toHaveText("2,78");
  await checkPage(kevin, "30-pronostic-panneau");

  // Rien n'est possible sans montant.
  const submit = sheet.getByRole("button", { name: "Valider mon ralli" });
  await expect(submit).toBeDisabled();
  await sheet.getByLabel("Aces engagés").fill("5");
  await expect(sheet.getByText("Minimum 10 Aces, en nombre entier")).toBeVisible();
  await expect(submit).toBeDisabled();
  await sheet.getByLabel("Aces engagés").fill("5000");
  await expect(sheet.getByText(/Solde insuffisant : vous avez 1\s000 Aces/)).toBeVisible();
  await expect(submit).toBeDisabled();

  // Montants rapides : « 250 » puis « Tout », le récapitulatif suit.
  await sheet.getByRole("button", { name: "250", exact: true }).click();
  await expect(sheet.getByLabel("Aces engagés")).toHaveValue("250");
  await expect(sheet.getByTestId("recap-win")).toHaveText("695"); // 250 × 2,78
  await sheet.getByRole("button", { name: "Tout" }).click();
  await expect(sheet.getByLabel("Aces engagés")).toHaveValue("1000");
  await expect(sheet.getByTestId("recap-balance")).toHaveText("0");

  await sheet.getByLabel("Aces engagés").fill("300");
  await expect(sheet.getByTestId("recap-committed")).toHaveText("300");
  await expect(sheet.getByTestId("recap-win")).toHaveText("834"); // 300 × 2,78
  await expect(sheet.getByTestId("recap-balance")).toHaveText("700");
  await submit.click();
  await expect(sheet).toBeHidden();

  const mine = kevin.getByTestId("my-prediction");
  await expect(mine).toContainText("Paul V.");
  await expect(mine).toContainText("300 Aces engagés à la cote 2,78");
  await expect(mine).toContainText("En attente du résultat.");
  await expect(balance(kevin)).toHaveText("700 Aces"); // le solde de l'en-tête suit
  // Définitif : plus de cotes à toucher sur ce match, encore sur l'autre.
  await expect(kevin.getByTestId("predict")).toHaveCount(1);
  await expect(kevin.getByRole("link", { name: "Partager mon pronostic" })).toHaveAttribute("href", /^https:\/\/wa\.me\/\?text=.*Paul%20V\..*%C3%A0%202%2C78/);
  await checkPage(kevin, "31-pronostic-enregistre");
});

test("Mes rallis de Kevin : solde, en attente, historique", async () => {
  await kevin.getByRole("navigation", { name: "Navigation principale" }).getByRole("link", { name: "Mes rallis" }).click();
  await expect(balance(kevin)).toHaveText("700 Aces");
  await expect(kevin.getByTestId("pending-aces")).toContainText("300 Aces");
  await expect(kevin.getByTestId("pending")).toContainText("Léa M. contre Paul V.");
  await expect(kevin.getByTestId("ledger").locator("li")).toHaveText([/Aces engagés[\s\S]*-300 Aces/, /Bonus d'inscription[\s\S]*\+1\s000 Aces/]);
  await expect(kevin.getByTestId("ledger-section")).not.toHaveAttribute("open", ""); // l'historique est replié par défaut
  await checkPage(kevin, "32-mes-rallis");
});

test("anti-trucage : admin et capitaine voient le motif, pas de formulaire", async () => {
  for (const [page, motif] of [[ivan, /admins ne peuvent pas pronostiquer les matchs de leurs clubs/], [jade, /capitaine ne peut pas/]] as const) {
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
  await expect(nina.getByText("Rejoins le club pour pronostiquer.")).toHaveCount(2);
  await expect(nina.getByTestId("join-to-predict").getByRole("button", { name: "Rejoindre le club" })).toBeVisible();
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
