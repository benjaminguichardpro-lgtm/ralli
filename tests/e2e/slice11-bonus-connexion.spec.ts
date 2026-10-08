import { type Browser, type Page, expect, test } from "@playwright/test";
import { backdateAccount, checkPage, seedLoginStreak, signIn, signUp } from "./helpers";

// Gaspard : compte créé aujourd'hui (aucun bonus), puis « ancien » (jour 1), Hector : série de 6 jours (jour 7).

test.describe.configure({ mode: "serial" });

let gaspard: Page, hector: Page;
const newPage = async (b: Browser) => (await b.newContext()).newPage();

test.beforeAll(async ({ browser }) => {
  [gaspard, hector] = await Promise.all([newPage(browser), newPage(browser)]);
});

test("le jour de l'inscription : pas de popup, pas de bonus", async () => {
  await signUp(gaspard, "Gaspard");
  await expect(gaspard.getByTestId("nav-user")).toHaveText("Gaspard");
  await gaspard.goto("/");
  await expect(gaspard.getByTestId("balance")).toHaveText("1 000 Aces");
  await gaspard.waitForTimeout(800); // laisse au serveur le temps de répondre : rien ne doit apparaître
  await expect(gaspard.getByTestId("daily-bonus")).toHaveCount(0);
});

test("le lendemain : popup « Connexion quotidienne 1/7 +10 Aces », le solde monte, une seule fois par jour", async () => {
  await backdateAccount("Gaspard", 1);
  await gaspard.goto("/");
  const popup = gaspard.getByTestId("daily-bonus");
  await expect(popup).toBeVisible();
  await expect(popup).toContainText("Connexion quotidienne");
  await expect(gaspard.getByTestId("daily-position")).toHaveText("1/7");
  await expect(gaspard.getByTestId("daily-total")).toHaveText("+10 Aces");
  await expect(gaspard.getByTestId("daily-detail")).toHaveText("Revenez demain : encore 6 jours avant le bonus de 50 Aces.");
  await checkPage(gaspard, "60-bonus-connexion");
  await popup.getByRole("button", { name: "Super" }).click();
  await expect(popup).toBeHidden();
  await expect(gaspard.getByTestId("balance")).toHaveText("1 010 Aces");

  // Même jour : ni nouvelle popup, ni nouveau crédit, y compris après rechargement.
  await gaspard.reload();
  await gaspard.waitForTimeout(800);
  await expect(gaspard.getByTestId("daily-bonus")).toHaveCount(0);
  await expect(gaspard.getByTestId("balance")).toHaveText("1 010 Aces");
});

test("le portefeuille garde la trace du bonus", async () => {
  await gaspard.goto("/portefeuille");
  await expect(gaspard.getByTestId("ledger").locator("li").first()).toContainText("Connexion quotidienne");
  await expect(gaspard.getByTestId("ledger").locator("li").first()).toContainText("+10 Aces");
});

test("7e jour d'affilée : +10 et +50, popup 7/7 avec +60 Aces", async () => {
  await signUp(hector, "Hector");
  await expect(hector.getByTestId("nav-user")).toHaveText("Hector");
  await backdateAccount("Hector", 10);
  await seedLoginStreak("Hector", 6);
  await hector.goto("/");
  await expect(hector.getByTestId("daily-position")).toHaveText("7/7");
  await expect(hector.getByTestId("daily-total")).toHaveText("+60 Aces");
  await expect(hector.getByTestId("daily-detail")).toContainText("10 Aces de connexion et 50 Aces de bonus pour 7 jours d'affilée");
  await checkPage(hector, "61-bonus-serie-7");
  await hector.getByTestId("daily-bonus").getByRole("button", { name: "Super" }).click();
  await expect(hector.getByTestId("balance")).toHaveText("1 120 Aces"); // 1000 + 60 (les 6 jours simulés, au ledger) + 60 (ce jour-là)
});

test("après une déconnexion puis reconnexion le même jour : aucun nouveau bonus", async () => {
  await hector.getByRole("button", { name: "Déconnexion" }).click();
  await signIn(hector, "Hector");
  await expect(hector.getByTestId("nav-user")).toHaveText("Hector");
  await hector.waitForTimeout(800);
  await expect(hector.getByTestId("daily-bonus")).toHaveCount(0);
});
