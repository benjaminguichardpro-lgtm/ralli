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

test("accueil de Yanis : uniquement la carte de la rencontre, l'heure en grand, solde en haut, pas de cotes", async () => {
  await yanis.goto("/");
  await expect(yanis.getByTestId("next-time")).toHaveText("15:30");
  await expect(yanis.getByTestId("next-encounter")).toContainText("dimanche 2 mai");
  await expect(yanis.getByTestId("next-encounter")).toContainText("Pronostics ouverts jusqu'à 15:30");
  await expect(yanis.getByTestId("next-encounter")).toContainText("Pronostiquer");
  await expect(yanis.getByTestId("balance")).toHaveText("1 000 Aces");
  await expect(yanis.getByTestId("feed")).toContainText("TC Voisin D1");
  // Ni cotes ni joueurs sur l'accueil, et la rencontre n'apparaît qu'une fois.
  await expect(yanis.getByTestId("odds")).toHaveCount(0);
  await expect(yanis.getByTestId("feed")).not.toContainText("Eva M.");
  await expect(yanis.getByTestId("feed").locator('a[href^="/rencontres/"]')).toHaveCount(1);
  await noHorizontalScroll(yanis);
  await checkPage(yanis, "50-accueil-fil");
});

test("un admin qui ne peut pas pronostiquer voit « Voir la rencontre »", async () => {
  await zoe.goto("/");
  await expect(zoe.getByTestId("next-encounter")).toContainText("Voir la rencontre");
  await expect(zoe.getByTestId("next-encounter")).not.toContainText("Pronostiquer");
});

test("la case touchée se remplit de terre battue avant l'ouverture du panneau, puis se vide à la fermeture", async () => {
  await yanis.goto(encounterUrl);
  const match = yanis.getByTestId("matches").locator("li").first();
  const picked = match.getByRole("button", { name: /Lou P\. gagne/ });
  const other = match.getByRole("button", { name: /Eva M\. gagne/ });
  const fillOf = (b: typeof picked) => b.getByTestId("clay-fill");
  const hidden = /^inset\(0(px)? 100% 0(px)? 0(px)?\)$/;

  await expect(picked).toHaveAttribute("data-fill", "idle");
  await expect(fillOf(picked)).toHaveCSS("clip-path", hidden);

  // On note l'état de la case à l'instant précis où le panneau s'ouvre.
  await yanis.evaluate(() => {
    const dialog = document.querySelector("dialog.sheet")!;
    // Deuxième case du premier simple : celle de « Lou P. », que le test touche.
    const fill = document.querySelectorAll('[data-testid="matches"] li [data-testid="clay-fill"]')[1] as HTMLElement;
    new MutationObserver(() => {
      if ((dialog as HTMLDialogElement).open) (window as unknown as Record<string, string>).__fillWhenOpened = getComputedStyle(fill).clipPath;
    }).observe(dialog, { attributes: true, attributeFilter: ["open"] });
  });

  await picked.click();
  const sheet = yanis.getByRole("dialog", { name: "Votre pronostic" });
  await expect(sheet).toBeVisible();
  // Le panneau ne s'est ouvert qu'une fois la case entièrement remplie.
  const atOpen = await yanis.evaluate(() => (window as unknown as Record<string, string>).__fillWhenOpened);
  expect(atOpen).toMatch(/^inset\(0(px)?( 0(px)?){0,3}\)$/);
  // Terre battue #b4502b, nom et cote en blanc, case voisine inchangée.
  await expect(picked).toHaveAttribute("data-fill", "open");
  await expect(fillOf(picked)).toHaveCSS("background-color", "rgb(180, 80, 43)");
  await expect(fillOf(picked)).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(picked).toHaveCSS("border-top-color", "rgb(180, 80, 43)");
  await expect(other).toHaveAttribute("data-fill", "idle");
  await expect(fillOf(other)).toHaveCSS("clip-path", hidden);
  await checkPage(yanis, "53-case-terre-battue");

  // Fermeture : la case redevient normale.
  await sheet.getByRole("button", { name: "Annuler" }).click();
  await expect(sheet).toBeHidden();
  await expect(picked).toHaveAttribute("data-fill", "idle");
  await expect(fillOf(picked)).toHaveCSS("clip-path", hidden);
  await expect(picked).toHaveCSS("border-top-color", "rgb(23, 80, 58)");

  // On peut recommencer, et la touche Échap referme aussi.
  await picked.click();
  await expect(sheet).toBeVisible();
  await yanis.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(picked).toHaveAttribute("data-fill", "idle");
});

test("« réduire les animations » : case pleine et panneau ouvert immédiatement, sans transition", async () => {
  await yanis.emulateMedia({ reducedMotion: "reduce" });
  await yanis.goto(encounterUrl);
  const picked = yanis.getByTestId("matches").locator("li").first().getByRole("button", { name: /Lou P\. gagne/ });
  await expect(picked.getByTestId("clay-fill")).toHaveCSS("transition-property", "none");
  await picked.click();
  const sheet = yanis.getByRole("dialog", { name: "Votre pronostic" });
  await expect(sheet).toBeVisible();
  await expect(picked).toHaveAttribute("data-fill", "open");
  await expect(picked.getByTestId("clay-fill")).toHaveCSS("background-color", "rgb(180, 80, 43)");
  await sheet.getByRole("button", { name: "Annuler" }).click();
  await expect(picked).toHaveAttribute("data-fill", "idle");
  await yanis.emulateMedia({ reducedMotion: "no-preference" });
});

test("pour pronostiquer : toucher la carte, puis la cote, le montant, valider ; le solde de l'en-tête suit", async () => {
  await yanis.goto("/");
  await yanis.getByTestId("next-encounter").click();
  await expect(yanis).toHaveURL(encounterUrl);
  await placeBet(yanis, yanis.getByTestId("matches").locator("li").first(), /Lou P\. gagne/, "100");
  await expect(yanis.getByTestId("my-prediction")).toContainText("100 Aces engagés à la cote 2,78");
  await expect(yanis.getByTestId("balance")).toHaveText("900 Aces");
  await yanis.getByRole("link", { name: "Portefeuille" }).first().click();
  await expect(yanis).toHaveURL(/\/portefeuille$/);
  await expect(yanis.getByTestId("wallet-balance")).toHaveText("900 Aces");
  await expect(yanis.getByTestId("balance")).toHaveText("900 Aces");
});

test("après le pronostic, l'accueil reste une simple carte vers la rencontre", async () => {
  await yanis.goto("/");
  await expect(yanis.getByTestId("odds")).toHaveCount(0);
  await expect(yanis.getByTestId("my-prediction")).toHaveCount(0);
  await yanis.getByTestId("next-encounter").click();
  await expect(yanis.getByTestId("my-prediction")).toContainText("Lou P.");
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
