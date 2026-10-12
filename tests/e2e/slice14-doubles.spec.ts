import { type Browser, type Page, expect, test } from "@playwright/test";
import { checkPage, forceStarted, openSection, placeBet, currentClubId, joinClubById, signUp, allowClubCreation } from "./helpers";

// Doubles : Mathilde (admin), Octave (capitaine de Messieurs 1), Ludo (membre qui pronostique).
// Pseudos propres à ce fichier : la base de test n'est vidée qu'au début de la suite, deux scénarios ne doivent pas partager un pseudo.

test.describe.configure({ mode: "serial" });

let dora: Page, cedric: Page, pablo: Page;
let clubUrl: string, url: string;

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

const double = (page: Page) => page.getByTestId("add-double");

/** Déplie le bloc « Ajouter un double » s'il ne l'est pas déjà (il reste ouvert après un ajout). */
async function openDouble(page: Page) {
  const open = await double(page).evaluate((el: HTMLDetailsElement) => el.open);
  if (!open) await double(page).locator("summary").click();
}

async function fillDouble(page: Page, v: { h1?: string; h2?: string; a1?: string; a2?: string; points?: string }) {
  const f = double(page);
  if (v.h1) await f.getByLabel("Joueur domicile 1").selectOption({ label: v.h1 });
  if (v.h2) await f.getByLabel("Joueur domicile 2").selectOption({ label: v.h2 });
  if (v.a1) await f.getByLabel("Joueur extérieur 1").selectOption({ label: v.a1 });
  if (v.a2) await f.getByLabel("Joueur extérieur 2").selectOption({ label: v.a2 });
  if (v.points) await f.getByLabel("Valeur du double").selectOption({ label: v.points });
}

test.beforeAll(async ({ browser }) => {
  [dora, cedric, pablo] = await Promise.all([newPage(browser), newPage(browser), newPage(browser)]);
});

test("mise en place : club, équipe de quatre joueurs, adversaire de quatre joueurs", async () => {
  await register(dora, "Mathilde");
  await allowClubCreation();
  await dora.goto("/clubs/nouveau");
  await dora.getByLabel("Nom du club").fill("TC Doubles");
  await dora.getByRole("button", { name: "Créer le club" }).click();
  const code = await currentClubId(dora);
  clubUrl = dora.url();
  for (const [page, name] of [[cedric, "Octave"], [pablo, "Ludo"]] as const) {
    await register(page, name);
    await joinClubById(page, code);
    await expect(page.getByText(/Votre rôle/)).toBeVisible();
  }
  await dora.goto(clubUrl);
  await openSection(dora, "Équipes du club");
  await dora.getByText("Créer une équipe").click();
  await dora.getByLabel("Nom de l'équipe", { exact: true }).fill("Messieurs 1");
  await dora.getByLabel("Capitaine").selectOption({ label: "Octave" });
  await dora.getByRole("button", { name: "Créer l'équipe" }).click();
  await addPlayer(dora, "Léa", "Martin", "30");
  await addPlayer(dora, "Hugo", "Durand", "30/1");
  await addPlayer(dora, "Inès", "Petit", "15/5");
  await addPlayer(dora, "Tom", "Blanc", "NC");

  await dora.goto(clubUrl);
  await openSection(dora, "Équipes adverses");
  await dora.getByText("Ajouter une équipe adverse").click();
  await dora.getByLabel("Club adverse").fill("TC Voisin");
  await dora.getByLabel("Nom de l'équipe adverse").fill("TC Voisin 1");
  await dora.getByRole("button", { name: "Ajouter l'équipe adverse" }).click();
  await addPlayer(dora, "Paul", "Voisin", "30/1");
  await addPlayer(dora, "Marc", "Lenoir", "30/2");
  await addPlayer(dora, "Yann", "Roux", "NC");
  await addPlayer(dora, "Eli", "Noir", "30");
});

test("Cedric compose : un simple, puis un double de 2 points ; le double ne propose que les joueurs de chaque équipe", async () => {
  await cedric.goto(`${clubUrl}/rencontres/nouvelle`);
  await cedric.getByLabel("Adversaire").selectOption({ label: "TC Voisin 1" });
  await cedric.getByLabel("Date et heure de début").fill("2027-06-06T14:00");
  await cedric.getByRole("button", { name: "Créer le brouillon" }).click();
  await expect(cedric.getByText("Brouillon", { exact: true })).toBeVisible();
  url = cedric.url();

  const single = cedric.getByTestId("add-match");
  await single.getByLabel("Joueur domicile").selectOption({ label: "Léa Martin (30)" });
  await single.getByLabel("Joueur extérieur").selectOption({ label: "Paul Voisin (30/1)" });
  await single.getByRole("button", { name: "Ajouter le match" }).click();
  await expect(cedric.getByTestId("matches").locator("li")).toHaveCount(1);

  await openDouble(cedric);
  // Uniquement des gens de l'équipe : chaque liste ne contient que les quatre joueurs de son équipe.
  const home1 = double(cedric).getByLabel("Joueur domicile 1");
  await expect(home1.locator("option:not([value=''])")).toHaveCount(4);
  await expect(home1).not.toContainText("Voisin");
  await expect(double(cedric).getByLabel("Joueur extérieur 1").locator("option:not([value=''])")).toHaveCount(4);
  await expect(double(cedric).getByLabel("Joueur extérieur 1")).not.toContainText("Martin");

  // Contrôles : second joueur manquant, même joueur deux fois.
  await fillDouble(cedric, { h1: "Léa Martin (30)", a1: "Paul Voisin (30/1)", a2: "Marc Lenoir (30/2)" });
  await double(cedric).getByRole("button", { name: "Ajouter le double" }).click();
  await expect(double(cedric).getByText("Choisissez le second joueur domicile")).toBeVisible();
  await fillDouble(cedric, { h1: "Léa Martin (30)", h2: "Léa Martin (30)", a1: "Paul Voisin (30/1)", a2: "Marc Lenoir (30/2)" });
  await double(cedric).getByRole("button", { name: "Ajouter le double" }).click();
  await expect(double(cedric).getByText("Les deux joueurs d'une même paire doivent être différents")).toBeVisible();

  await fillDouble(cedric, { h1: "Léa Martin (30)", h2: "Hugo Durand (30/1)", a1: "Paul Voisin (30/1)", a2: "Marc Lenoir (30/2)", points: "2 points" });
  await double(cedric).getByRole("button", { name: "Ajouter le double" }).click();
  await expect(cedric.getByTestId("matches").locator("li")).toHaveCount(2);
  const second = cedric.getByTestId("matches").locator("li").nth(1);
  await expect(second).toContainText("Double 1 · 2 points");
  await expect(second).toContainText("Léa M. / Hugo D.");
  await expect(second).toContainText("Paul V. / Marc L.");
  await expect(cedric.getByTestId("matches").locator("li").first()).toContainText("Simple 1");
  await checkPage(cedric, "100-double-brouillon");
});

test("au plus un double par joueur ; un joueur peut jouer un simple et un double ; pas de limite de matchs", async () => {
  await openDouble(cedric);
  // Léa joue déjà un double : refusé. Elle joue aussi un simple, ce qui était permis.
  await fillDouble(cedric, { h1: "Léa Martin (30)", h2: "Inès Petit (15/5)", a1: "Yann Roux (NC)", a2: "Eli Noir (30)", points: "1 point" });
  await double(cedric).getByRole("button", { name: "Ajouter le double" }).click();
  await expect(double(cedric).getByText("Un de ces joueurs dispute déjà un double dans cette rencontre")).toBeVisible();
  await fillDouble(cedric, { h1: "Inès Petit (15/5)", h2: "Tom Blanc (NC)", a1: "Yann Roux (NC)", a2: "Eli Noir (30)", points: "1 point" });
  await double(cedric).getByRole("button", { name: "Ajouter le double" }).click();
  await expect(cedric.getByTestId("matches").locator("li")).toHaveCount(3);
  await expect(cedric.getByTestId("matches").locator("li").nth(2)).toContainText("Double 2");
  await expect(cedric.getByTestId("matches").locator("li").nth(2)).not.toContainText("point");
});

test("Cedric modifie le double 1 : les points passent à 1, c'est toujours un double", async () => {
  const edit = cedric.getByTestId("manage").locator("details").filter({ hasText: "Modifier le double 1" });
  await edit.locator("summary").click();
  await expect(edit.getByLabel("Valeur du double")).toHaveValue("2");
  await edit.getByLabel("Valeur du double").selectOption({ label: "1 point" });
  await edit.getByRole("button", { name: "Enregistrer le match" }).click();
  await expect(edit.getByText("Match modifié.")).toBeVisible();
  await expect(cedric.getByTestId("matches").locator("li").nth(1)).not.toContainText("point");
  // Remise à 2 points pour la suite.
  await edit.getByLabel("Valeur du double").selectOption({ label: "2 points" });
  await edit.getByRole("button", { name: "Enregistrer le match" }).click();
  await expect(cedric.getByTestId("matches").locator("li").nth(1)).toContainText("Double 1 · 2 points");
});

test("publication : le double a ses cotes (moyenne des niveaux), Pablo pronostique sur la paire", async () => {
  cedric.once("dialog", (d) => void d.accept());
  await cedric.getByRole("button", { name: "Publier la rencontre" }).click();
  await expect(cedric.getByText("Pronostics ouverts", { exact: true })).toBeVisible();

  await pablo.goto(url);
  const row = pablo.getByTestId("matches").locator("li").nth(1);
  await expect(row).toContainText("Double 1 · 2 points");
  await expect(row.getByTestId("odds")).toHaveText(["1,56", "2,78"]); // 30 et 30/1 contre 30/1 et 30/2 : écart de 100 points, comme un simple 30 – 30/1
  await checkPage(pablo, "101-double-publie");
  await placeBet(pablo, row, /Paul V\. \/ Marc L\. gagne/, "100");
  await expect(row.getByTestId("my-prediction")).toContainText("100 Aces engagés à la cote 2,78");
  // Les participants (capitaine, admin) ne peuvent pas pronostiquer : le double aussi est protégé.
  await cedric.goto(url);
  await expect(cedric.getByTestId("blocked").first()).toHaveText("Un capitaine ne peut pas pronostiquer la rencontre de son équipe.");
  await expect(cedric.getByTestId("predict")).toHaveCount(0); // pas de formulaire de pronostic (les cotes ouvrent seulement la fenêtre d\'explication)
});

test("score : le double est saisi comme un simple, il rapporte 2 points ; décompte 1 – 2", async () => {
  await forceStarted(url);
  await cedric.goto(url);
  const box = cedric.getByTestId("propose-score");
  await box.locator("summary").click();
  await expect(box.getByText(/Double 1 : Léa M\. \/ Hugo D\. contre Paul V\. \/ Marc L\./)).toBeVisible();
  await expect(box.getByText(/Double 1 : .* · 2 points/)).toBeVisible();
  await box.getByLabel("Vainqueur du simple 1").selectOption({ label: "Léa M." });
  await box.getByLabel("Vainqueur du double 1").selectOption({ label: "Paul V. / Marc L." });
  await box.getByLabel("Sets du double 1 (facultatif)").fill("4-6 3-6");
  await box.getByLabel("Issue du double 2").selectOption({ label: "Non joué" });
  await box.getByLabel("Vainqueur du double 2").selectOption({ value: "" });
  cedric.once("dialog", (d) => void d.accept());
  await box.getByRole("button", { name: "Proposer le score" }).click();
  await expect(cedric.getByText("Score proposé", { exact: true })).toBeVisible();
  await expect(cedric.getByTestId("results")).toContainText("Paul V. / Marc L.");
  await expect(cedric.getByTestId("results")).toContainText("Double 2");

  await dora.goto(url);
  dora.once("dialog", (d) => void d.accept());
  await dora.getByRole("button", { name: "Confirmer le score" }).click();
  await expect(dora.getByText("Terminée", { exact: true })).toBeVisible();
  await expect(dora.getByTestId("tally")).toContainText("1 – 2"); // simple 1 point pour le club, double 2 points pour l'adversaire ; le double non joué n'en rapporte aucun
  await checkPage(dora, "102-double-score");
});

test("règlement : le pronostic sur le double est gagné à 2,78 et le portefeuille nomme la paire", async () => {
  await pablo.goto("/portefeuille");
  await expect(pablo.getByTestId("balance")).toHaveText("1 178 Aces"); // 1000 − 100 + 278
  await checkPage(pablo, "103-double-portefeuille");
  await pablo.goto("/rallis");
  await expect(pablo.getByTestId("results-list")).toContainText("Léa M. / Hugo D. contre Paul V. / Marc L.");
  await expect(pablo.getByTestId("results-list")).toContainText("Gagné");
  await expect(pablo.getByTestId("results-list")).toContainText("+178 Aces"); // 278 − 100
});
