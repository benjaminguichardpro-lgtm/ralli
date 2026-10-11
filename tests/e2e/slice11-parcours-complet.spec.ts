import { type Browser, type Page, expect, test } from "@playwright/test";
import { checkPage, forceStarted, openSection, placeBet, revealInviteCode, signUp } from "./helpers";

// Parcours complet, de la création du club au classement.
// Alma (admin), Cyril (capitaine), Bruno et Chloe (membres qui pronostiquent).

test.describe.configure({ mode: "serial" });

let alma: Page, cyril: Page, bruno: Page, chloe: Page;
let clubUrl: string, encounterUrl: string;

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

test.beforeAll(async ({ browser }) => {
  [alma, cyril, bruno, chloe] = await Promise.all([newPage(browser), newPage(browser), newPage(browser), newPage(browser)]);
});

test("1. Alma crée le club, les autres le rejoignent avec le code", async () => {
  await register(alma, "Alma");
  await alma.goto("/clubs/nouveau");
  await alma.getByLabel("Nom du club").fill("TC Parcours");
  await alma.getByRole("button", { name: "Créer le club" }).click();
  const code = await revealInviteCode(alma);
  clubUrl = alma.url();
  for (const [page, name] of [[cyril, "Cyril"], [bruno, "Bruno"], [chloe, "Chloe"]] as const) {
    await register(page, name);
    await page.goto("/clubs/rejoindre");
    await page.getByLabel("Code d'invitation").fill(code);
    await page.getByRole("button", { name: "Rejoindre" }).click();
    await expect(page.getByText(/Votre rôle/)).toBeVisible();
    // Un membre ordinaire ne voit pas le code d'invitation.
    await expect(page.getByTestId("invite-code")).toHaveCount(0);
  }
});

test("2. Alma crée l'équipe (capitaine Cyril), l'adversaire et les joueurs", async () => {
  await alma.goto(clubUrl);
  await openSection(alma, "Équipes du club");
  await alma.getByText("Créer une équipe").click();
  await alma.getByLabel("Nom de l'équipe", { exact: true }).fill("Messieurs 1");
  await alma.getByLabel("Capitaine").selectOption({ label: "Cyril" });
  await alma.getByRole("button", { name: "Créer l'équipe" }).click();
  await addPlayer(alma, "Léa", "Martin", "30");
  await addPlayer(alma, "Hugo", "Durand", "30/1");

  await alma.goto(clubUrl);
  await openSection(alma, "Équipes adverses");
  await alma.getByText("Ajouter une équipe adverse").click();
  await alma.getByLabel("Club adverse").fill("TC Voisin");
  await alma.getByLabel("Nom de l'équipe adverse").fill("TC Voisin 1");
  await alma.getByRole("button", { name: "Ajouter l'équipe adverse" }).click();
  await addPlayer(alma, "Paul", "Voisin", "30/1");
  await addPlayer(alma, "Marc", "Lenoir", "30/2");
});

test("3. Cyril compose et publie la rencontre (deux simples)", async () => {
  await cyril.goto(`${clubUrl}/rencontres/nouvelle`);
  await cyril.getByLabel("Adversaire").selectOption({ label: "TC Voisin 1" });
  await cyril.getByLabel("Date et heure de début").fill("2027-04-11T14:00");
  await cyril.getByRole("button", { name: "Créer le brouillon" }).click();
  await expect(cyril.getByText("Brouillon", { exact: true })).toBeVisible();
  encounterUrl = cyril.url();
  const pairs = [["Léa Martin (30)", "Paul Voisin (30/1)"], ["Hugo Durand (30/1)", "Marc Lenoir (30/2)"]] as const;
  for (const [i, [home, away]] of pairs.entries()) {
    const add = cyril.getByTestId("add-match");
    await add.getByLabel("Joueur domicile").selectOption({ label: home });
    await add.getByLabel("Joueur extérieur").selectOption({ label: away });
    await add.getByRole("button", { name: "Ajouter le match" }).click();
    await expect(cyril.getByTestId("matches").locator("li")).toHaveCount(i + 1);
  }
  cyril.once("dialog", (d) => void d.accept());
  await cyril.getByRole("button", { name: "Publier la rencontre" }).click();
  await expect(cyril.getByText("Pronostics ouverts", { exact: true })).toBeVisible();
  await checkPage(cyril, "80-parcours-rencontre-publiee");
});

test("4. Anti-trucage : ni le capitaine ni l'admin ne peuvent pronostiquer leur rencontre", async () => {
  await cyril.goto(encounterUrl);
  await expect(cyril.getByTestId("blocked").first()).toHaveText("Un capitaine ne peut pas pronostiquer la rencontre de son équipe.");
  await expect(cyril.getByTestId("predict")).toHaveCount(0); // pas de formulaire de pronostic (les cotes ouvrent seulement la fenêtre d\'explication)
  await alma.goto(encounterUrl);
  await expect(alma.getByTestId("blocked").first()).toHaveText("Les admins ne peuvent pas pronostiquer les matchs de leurs clubs.");
  await expect(alma.getByTestId("predict")).toHaveCount(0); // pas de formulaire de pronostic (les cotes ouvrent seulement la fenêtre d\'explication)
});

test("5. Bruno et Chloe pronostiquent, leur solde baisse", async () => {
  const bet = async (page: Page, n: number, pick: RegExp, aces: string) => {
    await page.goto(encounterUrl);
    await placeBet(page, page.getByTestId("matches").locator("li").nth(n), pick, aces);
    await expect(page.getByTestId("my-prediction").first()).toBeVisible();
  };
  await bet(bruno, 0, /Léa M\. gagne/, "100");
  await bet(bruno, 1, /Marc L\. gagne/, "50");
  await bet(chloe, 0, /Paul V\. gagne/, "100");
  await bet(chloe, 1, /Hugo D\. gagne/, "40");
  await bruno.goto("/portefeuille");
  await expect(bruno.getByTestId("balance")).toHaveText("850 Aces");
  await chloe.goto("/portefeuille");
  await expect(chloe.getByTestId("balance")).toHaveText("860 Aces");
});

test("6. La rencontre commence : Cyril propose le score, il ne peut pas le confirmer lui-même", async () => {
  await forceStarted(encounterUrl);
  await cyril.goto(encounterUrl);
  await expect(cyril.getByText("Pronostics fermés", { exact: true })).toBeVisible();
  const box = cyril.getByTestId("propose-score");
  await box.locator("summary").click();
  await box.getByLabel("Vainqueur du simple 1").selectOption({ label: "Léa M." });
  await box.getByLabel("Vainqueur du simple 2").selectOption({ label: "Marc L." });
  cyril.once("dialog", (d) => void d.accept());
  await box.getByRole("button", { name: "Proposer le score" }).click();
  await expect(cyril.getByText("Score proposé", { exact: true })).toBeVisible();
  await expect(cyril.getByRole("button", { name: "Confirmer le score" })).toHaveCount(0);
  // Pas encore réglé : les Aces restent engagés.
  await bruno.goto("/portefeuille");
  await expect(bruno.getByTestId("balance")).toHaveText("850 Aces");
});

test("7. Alma confirme : score définitif et règlement des pronostics", async () => {
  await alma.goto(encounterUrl);
  alma.once("dialog", (d) => void d.accept());
  await alma.getByRole("button", { name: "Confirmer le score" }).click();
  await expect(alma.getByText("Terminée", { exact: true })).toBeVisible();
  await expect(alma.getByTestId("tally")).toContainText("1 – 1");

  // Bruno : 100 à 1,56 gagné (156) et 50 à 2,78 gagné (139) → 850 + 156 + 139.
  await bruno.goto("/portefeuille");
  await expect(bruno.getByTestId("balance")).toHaveText("1 145 Aces");
  await expect(bruno.getByTestId("pending")).toHaveCount(0);
  // Chloe : les deux pronostics perdus.
  await chloe.goto("/portefeuille");
  await expect(chloe.getByTestId("balance")).toHaveText("860 Aces");
  await checkPage(chloe, "81-parcours-portefeuille");
  await chloe.goto("/rallis");
  await expect(chloe.getByTestId("results-list")).toContainText("Perdu");
  await expect(chloe.getByTestId("results-hits")).toContainText("0 ralli juste sur 2");
});

test("8. Classements : « cette semaine » classe Bruno premier ; la saison demande 3 pronostics", async () => {
  await bruno.goto(`${clubUrl}/classement?periode=semaine`);
  await expect(bruno.getByTestId("leaderboard-row")).toHaveText([
    /1\s*Bruno\s*\(vous\)\s*\+145 Aces\s*2\s*100 %/,
    /2\s*Chloe\s*−140 Aces\s*2\s*0 %/,
  ]);
  // Chaque ligne du classement porte l'avatar du joueur (prédéfini, ou la photo si elle existe).
  await expect(bruno.getByTestId("leaderboard-row").getByTestId("avatar")).toHaveCount(2);
  await expect(bruno.getByTestId("leaderboard-row").first().getByTestId("avatar")).toHaveAttribute("src", /^\/avatar\/[a-z-]+\.svg$/);
  await checkPage(bruno, "82-parcours-classement-semaine");
  await bruno.goto(`${clubUrl}/classement`);
  await expect(bruno.getByTestId("leaderboard-row")).toHaveCount(0);
  await expect(bruno.getByTestId("my-progress")).toHaveText("Vous avez 2 pronostics terminés : il en faut 3 pour apparaître.");
});

test("9. Le visiteur sans compte voit le score définitif mais pas le journal", async ({ browser }) => {
  const anon = await newPage(browser);
  await anon.goto(encounterUrl);
  await expect(anon.getByTestId("tally")).toContainText("1 – 1");
  await expect(anon.getByTestId("journal")).toHaveCount(0);
  await checkPage(anon, "83-parcours-public");
});
