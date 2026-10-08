import { type Browser, type Page, expect, test } from "@playwright/test";
import { checkPage, placeBet, signUp } from "./helpers";

// Zoe (admin et capitaine), Yanis (membre qui pronostique), un visiteur sans compte.

test.describe.configure({ mode: "serial" });

let zoe: Page, yanis: Page, anon: Page;
let clubUrl: string, clubId: string, encounterUrl: string;

const newPage = async (b: Browser) => (await b.newContext()).newPage();
const tabs = (p: Page) => p.getByRole("navigation", { name: "Navigation principale" });

async function register(page: Page, name: string) {
  await signUp(page, name);
  await expect(page.getByTestId("nav-user")).toHaveText(name);
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "défilement horizontal").toBeLessThanOrEqual(0);
}

test.beforeAll(async ({ browser }) => {
  [zoe, yanis, anon] = await Promise.all([newPage(browser), newPage(browser), newPage(browser)]);
});

test("mise en place : club, équipe, rencontre publiée à 15:30", async () => {
  await register(zoe, "Zoe");
  await zoe.goto("/clubs/nouveau");
  await zoe.getByLabel("Nom du club").fill("TC Ecrans");
  await zoe.getByRole("button", { name: "Créer le club" }).click();
  const code = (await zoe.getByTestId("invite-code").innerText()).trim();
  clubUrl = zoe.url();
  clubId = clubUrl.split("/").pop()!;
  await register(yanis, "Yanis");
  await yanis.goto("/clubs/rejoindre");
  await yanis.getByLabel("Code d'invitation").fill(code);
  await yanis.getByRole("button", { name: "Rejoindre" }).click();
  await expect(yanis.getByText(/Votre rôle/)).toBeVisible();

  await zoe.getByText("Créer une équipe").click();
  await zoe.getByLabel("Nom de l'équipe", { exact: true }).fill("Dames 1");
  await zoe.getByLabel("Capitaine").selectOption({ label: "Zoe" });
  await zoe.getByRole("button", { name: "Créer l'équipe" }).click();
  const addPlayer = async (first: string, last: string, rank: string) => {
    const form = zoe.getByTestId("add-player");
    await form.getByLabel("Prénom").fill(first);
    await form.getByLabel("Nom", { exact: true }).fill(last);
    await form.getByLabel("Niveau FFT").selectOption({ label: rank });
    await form.getByRole("button", { name: "Ajouter le joueur" }).click();
    await expect(form.getByText(`${first} ${last} ajouté(e) à l'équipe.`)).toBeVisible();
  };
  await addPlayer("Eva", "Moreau", "30");
  await zoe.goto(clubUrl);
  await zoe.getByText("Ajouter une équipe adverse").click();
  await zoe.getByLabel("Club adverse").fill("TC Voisin");
  await zoe.getByLabel("Nom de l'équipe adverse").fill("TC Voisin D1");
  await zoe.getByRole("button", { name: "Ajouter l'équipe adverse" }).click();
  await addPlayer("Lou", "Petit", "30/1");

  await zoe.goto(`${clubUrl}/rencontres/nouvelle`);
  await zoe.getByLabel("Adversaire").selectOption({ label: "TC Voisin D1" });
  await zoe.getByLabel("Date et heure de début").fill("2027-05-02T15:30");
  await zoe.getByRole("button", { name: "Créer le brouillon" }).click();
  await expect(zoe.getByText("Brouillon", { exact: true })).toBeVisible();
  encounterUrl = zoe.url();
  const add = zoe.getByTestId("add-match");
  await add.getByLabel("Joueur domicile").selectOption({ label: "Eva Moreau (30)" });
  await add.getByLabel("Joueur extérieur").selectOption({ label: "Lou Petit (30/1)" });
  await add.getByRole("button", { name: "Ajouter le match" }).click();
  await expect(zoe.getByTestId("matches").locator("li")).toHaveCount(1);
  zoe.once("dialog", (d) => void d.accept());
  await zoe.getByRole("button", { name: "Publier la rencontre" }).click();
  await expect(zoe.getByText("Pronostics ouverts", { exact: true })).toBeVisible();
});

test("accueil de Yanis : l'heure de la prochaine rencontre en grand, solde en haut", async () => {
  await yanis.goto("/");
  await expect(yanis.getByTestId("next-time")).toHaveText("15:30");
  await expect(yanis.getByTestId("next-encounter")).toContainText("dimanche 2 mai");
  await expect(yanis.getByTestId("next-encounter")).toContainText("Pronostics ouverts jusqu'à 15:30");
  await expect(yanis.getByTestId("balance")).toHaveText("1 000 Aces");
  await expect(yanis.getByTestId("feed")).toContainText("Eva M.");
  await expect(yanis.getByTestId("odds")).toHaveText(["1,56", "2,78"]);
  await noHorizontalScroll(yanis);
  await checkPage(yanis, "50-accueil-fil");
});

test("pronostic en trois gestes depuis l'accueil, le solde de l'en-tête suit", async () => {
  await placeBet(yanis, yanis.getByTestId("feed").locator("li li").first(), /Lou P\. gagne/, "100");
  await expect(yanis.getByTestId("my-prediction")).toContainText("100 Aces engagés à la cote 2,78");
  await expect(yanis.getByTestId("balance")).toHaveText("900 Aces");
  await yanis.getByRole("link", { name: "Portefeuille" }).first().click();
  await expect(yanis).toHaveURL(/\/portefeuille$/);
  await expect(yanis.getByTestId("wallet-balance")).toHaveText("900 Aces");
  await expect(yanis.getByTestId("balance")).toHaveText("900 Aces");
});

test("barre du bas : un seul club mène directement au classement et au club, onglet actif signalé", async () => {
  await yanis.goto("/");
  const nav = tabs(yanis);
  await expect(nav.getByRole("link")).toHaveText(["Matchs", "Classement", "Portefeuille", "Club"]);
  await expect(nav.getByRole("link", { name: "Matchs" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Classement" })).toHaveAttribute("href", `/clubs/${clubId}/classement`);
  await expect(nav.getByRole("link", { name: "Club" })).toHaveAttribute("href", `/clubs/${clubId}`);
  await nav.getByRole("link", { name: "Classement" }).click();
  await expect(yanis).toHaveURL(/\/classement$/);
  await expect(nav.getByRole("link", { name: "Classement" })).toHaveAttribute("aria-current", "page");
  await nav.getByRole("link", { name: "Club" }).click();
  await expect(yanis.getByRole("heading", { name: "TC Ecrans" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Club" })).toHaveAttribute("aria-current", "page");
  const heights = await nav.getByRole("link").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  for (const h of heights) expect(h).toBeGreaterThanOrEqual(44);
});

test("plusieurs clubs : « Club » et « Classement » mènent à une liste", async () => {
  await yanis.goto("/clubs/nouveau");
  await yanis.getByLabel("Nom du club").fill("Club de Yanis");
  await yanis.getByRole("button", { name: "Créer le club" }).click();
  await yanis.goto("/");
  const nav = tabs(yanis);
  await expect(nav.getByRole("link", { name: "Club" })).toHaveAttribute("href", "/clubs");
  await expect(nav.getByRole("link", { name: "Classement" })).toHaveAttribute("href", "/classement");
  await nav.getByRole("link", { name: "Club" }).click();
  await expect(yanis.getByTestId("my-clubs")).toContainText("TC Ecrans");
  await expect(yanis.getByTestId("my-clubs")).toContainText("Club de Yanis");
  await checkPage(yanis, "51-mes-clubs");
  await nav.getByRole("link", { name: "Classement" }).click();
  await expect(yanis).toHaveURL(/\/classement$/);
  await expect(yanis.getByRole("link", { name: "TC Ecrans" })).toBeVisible();
  await yanis.getByRole("link", { name: "TC Ecrans" }).click();
  await expect(yanis).toHaveURL(new RegExp(`/clubs/${clubId}/classement$`));
});

test("visiteur : pas de barre du bas, page de la rencontre partageable", async () => {
  await anon.goto("/");
  await expect(tabs(anon)).toHaveCount(0);
  await anon.goto(encounterUrl);
  await expect(anon.getByTestId("starts-at")).toHaveText("dimanche 2 mai 2027 à 15:30");
  const share = anon.getByRole("link", { name: "Partager la rencontre" });
  await expect(share).toHaveAttribute("href", /^https:\/\/wa\.me\/\?text=.*TC%20Voisin%20D1.*%2Frencontres%2F/);
  await expect(anon.getByTestId("odds")).toHaveText(["1,56", "2,78"]);
  await noHorizontalScroll(anon);
  await checkPage(anon, "52-rencontre-publique");
});
