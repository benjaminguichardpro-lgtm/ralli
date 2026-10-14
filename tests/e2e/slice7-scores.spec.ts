import { type Browser, type Page, expect, test } from "@playwright/test";
import { awaitServerAction, checkPage, forceStarted, openSection, placeBet, currentClubId, joinClubById, signUp, allowClubCreation } from "./helpers";

// Sacha (admin), Tess (capitaine Messieurs 1), Ugo (capitaine Messieurs 2), Vera (membre), un visiteur sans compte.

test.describe.configure({ mode: "serial" });

let sacha: Page, tess: Page, ugo: Page, vera: Page, anon: Page;
let clubUrl: string, url1: string, url2: string;

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

async function newEncounter(page: Page, start: string): Promise<string> {
  await page.goto(`${clubUrl}/rencontres/nouvelle`);
  await page.getByLabel("Adversaire").selectOption({ label: "TC Voisin 1" });
  await page.getByLabel("Date et heure de début").fill(start);
  await page.getByRole("button", { name: "Créer le brouillon" }).click();
  await expect(page.getByText("Brouillon", { exact: true })).toBeVisible();
  const url = page.url();
  const pairs = [["Léa Martin (30)", "Paul Voisin (30/1)"], ["Hugo Durand (30/1)", "Marc Lenoir (30/2)"]] as const;
  for (const [i, [home, away]] of pairs.entries()) {
    const add = page.getByTestId("add-match");
    await add.getByLabel("Joueur domicile").selectOption({ label: home });
    await add.getByLabel("Joueur extérieur").selectOption({ label: away });
    await add.getByRole("button", { name: "Ajouter le match" }).click();
    await expect(page.getByTestId("matches").locator("li")).toHaveCount(i + 1);
  }
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Publier la rencontre" }).click();
  await expect(page.getByText("Pronostics ouverts", { exact: true })).toBeVisible();
  return url;
}

/** Remplit les champs d'un simple dans un formulaire de score. */
async function fillMatch(scope: ReturnType<Page["locator"]>, n: number, f: { outcome?: string; winner?: string; sets?: string }) {
  if (f.outcome) await scope.getByLabel(`Issue du simple ${n}`).selectOption({ label: f.outcome });
  if (f.winner !== undefined) await scope.getByLabel(`Vainqueur du simple ${n}`).selectOption(f.winner ? { label: f.winner } : { value: "" });
  if (f.sets !== undefined) await scope.getByLabel(`Sets du simple ${n}`).fill(f.sets);
}

test.beforeAll(async ({ browser }) => {
  [sacha, tess, ugo, vera, anon] = await Promise.all([newPage(browser), newPage(browser), newPage(browser), newPage(browser), newPage(browser)]);
});

test("mise en place : club, deux équipes, deux rencontres publiées", async () => {
  await register(sacha, "Sacha");
  await allowClubCreation();
  await sacha.goto("/clubs/nouveau");
  await sacha.getByLabel("Nom du club").fill("TC Scores");
  await sacha.getByRole("button", { name: "Créer le club" }).click();
  const code = await currentClubId(sacha);
  clubUrl = sacha.url();
  for (const [page, name] of [[tess, "Tess"], [ugo, "Ugo"], [vera, "Vera"]] as const) {
    await register(page, name);
    await joinClubById(page, code);
    await expect(page.getByText(/Votre rôle/)).toBeVisible();
  }
  for (const [team, captain] of [["Messieurs 1", "Tess"], ["Messieurs 2", "Ugo"]] as const) {
    await sacha.goto(clubUrl);
    await openSection(sacha, "Équipes du club");
    await sacha.getByText("Créer une équipe").click();
    await sacha.getByLabel("Nom de l'équipe", { exact: true }).fill(team);
    await sacha.getByLabel("Capitaine").selectOption({ label: captain });
    await sacha.getByRole("button", { name: "Créer l'équipe" }).click();
    if (team === "Messieurs 1") {
      await addPlayer(sacha, "Léa", "Martin", "30");
      await addPlayer(sacha, "Hugo", "Durand", "30/1");
    }
  }
  await sacha.goto(clubUrl);
  await openSection(sacha, "Équipes adverses");
  await sacha.getByText("Ajouter une équipe adverse").click();
  await sacha.getByLabel("Club adverse").fill("TC Voisin");
  await sacha.getByLabel("Nom de l'équipe adverse").fill("TC Voisin 1");
  await sacha.getByRole("button", { name: "Ajouter l'équipe adverse" }).click();
  await addPlayer(sacha, "Paul", "Voisin", "30/1");
  await addPlayer(sacha, "Marc", "Lenoir", "30/2");

  url1 = await newEncounter(tess, "2027-03-14T14:00");
  url2 = await newEncounter(tess, "2027-03-21T14:00");
});

test("pronostics avant le début : Vera sur les deux rencontres, Ugo sur la première", async () => {
  const bet = async (page: Page, url: string, n: number, pick: RegExp, aces: string) => {
    await page.goto(url);
    await placeBet(page, page.getByTestId("matches").locator("li").nth(n), pick, aces);
    await expect(page.getByTestId("my-prediction").first()).toBeVisible();
  };
  await bet(vera, url2, 0, /Léa M\. gagne/, "100");
  await bet(vera, url2, 1, /Marc L\. gagne, cote 2,78/, "50");
  await bet(vera, url1, 0, /Léa M\. gagne/, "40");
  await bet(ugo, url1, 0, /Paul V\. gagne, cote 2,78/, "100");
});

test("avant le début : aucun bouton de score", async () => {
  await tess.goto(url1);
  await expect(tess.getByTestId("propose-score")).toHaveCount(0);
  await expect(tess.getByTestId("score-section")).toHaveCount(0);
});

test("après le début : Tess et Sacha peuvent proposer, Ugo (autre équipe) et Vera non", async () => {
  await forceStarted(url1);
  await forceStarted(url2);
  await tess.goto(url1);
  await expect(tess.getByText("Pronostics fermés", { exact: true })).toBeVisible();
  await expect(tess.getByTestId("propose-score")).toBeVisible();
  await sacha.goto(url1);
  await expect(sacha.getByTestId("propose-score")).toBeVisible();
  for (const p of [ugo, vera, anon]) {
    await p.goto(url1);
    await expect(p.getByTestId("propose-score")).toHaveCount(0);
  }
});

test("Tess propose : saisie contrôlée, puis succès", async () => {
  await tess.goto(url1);
  const box = tess.getByTestId("propose-score");
  await box.locator("summary").click();
  await checkPage(tess, "40-proposer-score");

  await fillMatch(box, 1, { winner: "Léa M.", sets: "20-0 6-3" });
  await fillMatch(box, 2, { outcome: "Non joué", winner: "", sets: "" });
  tess.once("dialog", (d) => void d.accept());
  await box.getByRole("button", { name: "Proposer le score" }).click();
  await expect(box.getByText(/Score de set improbable : 20-0/)).toBeVisible();

  await waitForFormReset(tess);
  await fillMatch(box, 1, { sets: "6-4 3-6 10-8" });
  tess.once("dialog", (d) => void d.accept());
  await box.getByRole("button", { name: "Proposer le score" }).click();
  await expect(tess.getByText("Score proposé", { exact: true })).toBeVisible();
  await expect(tess.getByTestId("proposed-by")).toHaveText("Proposé par Tess.");
  await expect(tess.getByTestId("results")).toContainText("Léa M.");
  await expect(tess.getByTestId("results")).toContainText("6-4 3-6 10-8");
  await expect(tess.getByTestId("results")).toContainText("Non joué");
});

async function waitForFormReset(p: Page) {
  // React remet les champs à leur valeur une fois l'action terminée : on laisse ce reset passer.
  await p.waitForTimeout(500);
}

test("l'auteur ne peut pas confirmer, il peut retirer ; le public voit le score provisoire, mais pas le journal", async () => {
  await expect(tess.getByRole("button", { name: "Confirmer le score" })).toHaveCount(0);
  await expect(tess.getByRole("button", { name: "Contester le score" })).toHaveCount(0);
  await expect(tess.getByRole("button", { name: "Retirer ma proposition" })).toBeVisible();
  for (const p of [vera, anon]) {
    await p.goto(url1);
    await expect(p.getByTestId("tally")).toContainText("Score provisoire");
    await expect(p.getByTestId("provisional-note")).toContainText("Score provisoire : il sera définitif quand un second admin ou capitaine l'aura confirmé");
    await expect(p.getByTestId("results")).toBeVisible();
    await expect(p.getByTestId("journal")).toHaveCount(0);
    await expect(p.getByRole("button", { name: "Confirmer le score" })).toHaveCount(0);
  }
  await checkPage(anon, "41-score-propose-public");
});

test("Ugo conteste : motif obligatoire", async () => {
  await ugo.goto(url1);
  await expect(ugo.getByTestId("results")).toContainText("Léa M.");
  await expect(ugo.getByRole("button", { name: "Confirmer le score" })).toBeVisible();
  const box = ugo.getByTestId("dispute-score");
  await box.locator("summary").click();
  ugo.once("dialog", (d) => void d.accept());
  await box.getByRole("button", { name: "Contester le score" }).click();
  await expect(box.getByText("Indiquez le motif de la contestation")).toBeVisible();
  await box.getByLabel("Motif de la contestation").fill("Paul a gagné en deux sets");
  ugo.once("dialog", (d) => void d.accept());
  await box.getByRole("button", { name: "Contester le score" }).click();
  await expect(ugo.getByText("Score contesté", { exact: true })).toBeVisible();
  await expect(ugo.getByTestId("dispute-reason")).toContainText("Paul a gagné en deux sets");
  await expect(ugo.getByTestId("resolve-dispute")).toHaveCount(0);
});

test("Tess (capitaine) ne peut pas trancher ; Sacha (admin) le peut, avec l'avertissement", async () => {
  await tess.goto(url1);
  await expect(tess.getByTestId("resolve-dispute")).toHaveCount(0);
  await sacha.goto(url1);
  const box = sacha.getByTestId("resolve-dispute");
  await expect(box.getByTestId("cheat-warning")).toHaveText("Chaque triche sera suivie d'un bannissement à vie de Ralli.");
  await expect(box.getByLabel("Sets du simple 1")).toHaveValue("6-4 3-6 10-8");
  await checkPage(sacha, "42-trancher-litige");
  await fillMatch(box, 1, { winner: "Paul V.", sets: "4-6 3-6" });
  sacha.once("dialog", (d) => void d.accept());
  await box.getByRole("button", { name: "Trancher le litige" }).click();
  await expect(sacha.getByText("Terminée", { exact: true })).toBeVisible();
  await expect(sacha.getByTestId("tally")).toContainText("0 – 1");
});

test("score définitif : public avec décompte, plus aucune action, journal réservé", async () => {
  await anon.goto(url1);
  await expect(anon.getByTestId("tally")).toContainText("TC Scores · Messieurs 1 0 – 1 TC Voisin 1");
  await expect(anon.getByTestId("results")).toContainText("Paul V.");
  await expect(anon.getByTestId("results")).toContainText("4-6 3-6");
  await expect(anon.getByTestId("journal")).toHaveCount(0);
  await expect(anon.locator("main")).not.toContainText("Voisin 2");
  await checkPage(anon, "43-score-definitif-public");

  await sacha.goto(url1);
  for (const name of ["Confirmer le score", "Contester le score", "Retirer ma proposition", "Trancher le litige", "Proposer le score"]) {
    await expect(sacha.getByRole("button", { name })).toHaveCount(0);
  }
  const journal = sacha.getByTestId("journal");
  await journal.locator("summary").click();
  await expect(journal).toContainText("Score proposé");
  await expect(journal).toContainText("Score contesté : Paul a gagné en deux sets");
  await expect(journal).toContainText("Litige tranché");
});

test("seconde rencontre : retrait puis nouvelle proposition, confirmée par une autre personne", async () => {
  await tess.goto(url2);
  let box = tess.getByTestId("propose-score");
  await box.locator("summary").click();
  await fillMatch(box, 1, { winner: "Léa M.", sets: "" });
  await fillMatch(box, 2, { winner: "Hugo D.", sets: "" });
  tess.once("dialog", (d) => void d.accept());
  await box.getByRole("button", { name: "Proposer le score" }).click();
  await expect(tess.getByText("Score proposé", { exact: true })).toBeVisible();

  tess.once("dialog", (d) => void d.accept());
  await tess.getByRole("button", { name: "Retirer ma proposition" }).click();
  await expect(tess.getByText("Pronostics fermés", { exact: true })).toBeVisible();
  // Les résultats sont effacés : plus de score, et la saisie en direct est de nouveau proposée match par match.
  await expect(tess.getByTestId("tally")).toHaveCount(0);
  await expect(tess.getByTestId("results").getByText("Pas de résultat saisi.")).toHaveCount(2);

  box = tess.getByTestId("propose-score");
  await box.locator("summary").click();
  await expect(box.getByLabel("Issue du simple 1")).toHaveValue("COMPLETED");
  await fillMatch(box, 1, { winner: "Paul V.", sets: "" });
  await fillMatch(box, 2, { winner: "Marc L.", sets: "" });
  tess.once("dialog", (d) => void d.accept());
  await box.getByRole("button", { name: "Proposer le score" }).click();
  await expect(tess.getByText("Score proposé", { exact: true })).toBeVisible();

  await ugo.goto(url2);
  // Ugo avait pronostiqué la première rencontre, réglée entre-temps : son récapitulatif passe d'abord.
  await expect(ugo.getByTestId("results-recap")).toBeVisible();
  await ugo.getByTestId("results-recap").getByRole("button").last().click();
  await expect(ugo.getByTestId("results-recap")).toBeHidden();
  ugo.once("dialog", (d) => void d.accept());
  await ugo.getByRole("button", { name: "Confirmer le score" }).click();
  await expect(ugo.getByText("Terminée", { exact: true })).toBeVisible();
  await expect(ugo.getByTestId("tally")).toContainText("0 – 2");
  await checkPage(ugo, "44-score-confirme");
});

test("règlement : Vera voit son pronostic perdu et son pronostic gagné", async () => {
  await vera.goto(url2);
  const mine = vera.getByTestId("my-prediction");
  await expect(mine.nth(0)).toContainText("Perdu.");
  await expect(mine.nth(1)).toContainText("Gagné : 139 Aces.");
  await vera.goto("/portefeuille");
  // 1000 − 100 − 50 − 40 + 139
  await expect(vera.getByTestId("balance")).toHaveText("949 Aces");
  await expect(vera.getByTestId("pending")).toHaveCount(0);
  await expect(vera.getByTestId("settled")).toHaveCount(0); // les rallis terminés ne sont plus dans le portefeuille
  await expect(vera.getByTestId("ledger")).toContainText("Aces gagnés");
  await expect(vera.getByTestId("ledger")).toContainText("+139 Aces");
  await checkPage(vera, "45-portefeuille-apres-reglement");
  // …ils sont dans l'onglet Résultats : 3 rallis (100 perdus, 40 perdus, 50 gagnés à 2,78 = 139).
  await vera.goto("/rallis");
  await expect(vera.getByTestId("result-item")).toHaveCount(3);
  await expect(vera.getByTestId("results-list")).toContainText("Perdu");
  await expect(vera.getByTestId("results-list")).toContainText("Gagné");
  await expect(vera.getByTestId("results-list")).toContainText("+89 Aces"); // 139 − 50
  await expect(vera.getByTestId("results-list")).toContainText("−100 Aces");
  await expect(vera.getByTestId("results-hits")).toContainText("1 ralli juste sur 3");
  await expect(vera.getByTestId("results-net")).toHaveText("−51 Aces"); // 139 − (100 + 50 + 40)
});

test("classement du club : saison (seuil de 3) et semaine (seuil de 1)", async () => {
  // Vera : 3 pronostics terminés (−40, −100, +89), Ugo : 1 (+178).
  await vera.goto(`${clubUrl}/classement`);
  // Vera a des pronostics réglés qu'elle n'a pas encore vus : le récapitulatif passe d'abord.
  await expect(vera.getByTestId("results-recap")).toBeVisible();
  // Fermée avec Échap (le récapitulatif défile quand il y a 3 résultats : le clic automatique sur « Super » y est capricieux ; l'effet est le même).
  await awaitServerAction(vera, () => vera.keyboard.press("Escape"));
  await expect(vera.getByTestId("results-recap")).toBeHidden();
  const rows = vera.getByTestId("leaderboard-row");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Vera");
  await expect(rows.first()).toContainText("(vous)");
  await expect(rows.first()).toContainText("−51 Aces");
  await expect(rows.first()).toContainText("3");
  await expect(rows.first()).toContainText("33 %");
  await checkPage(vera, "46-classement-saison");

  await vera.getByRole("link", { name: "Cette semaine" }).click();
  await expect(vera).toHaveURL(/periode=semaine/);
  await expect(vera.getByTestId("leaderboard-row")).toHaveText([/1\s*Ugo\s*\+178 Aces\s*1\s*100 %/, /2\s*Vera\s*\(vous\)\s*−51 Aces\s*3\s*33 %/]);
  await checkPage(vera, "47-classement-semaine");

  // Ugo : trop peu de pronostics terminés sur la saison, mais classé 1er de la semaine.
  await ugo.goto(`${clubUrl}/classement`);
  await expect(ugo.getByTestId("leaderboard-row")).toHaveCount(1); // Vera seule
  await expect(ugo.getByTestId("my-progress")).toHaveText("Vous avez 1 pronostic terminé : il en faut 3 pour apparaître.");

  // Sacha (admin) n'a aucun pronostic : message d'explication.
  await sacha.goto(`${clubUrl}/classement`);
  await expect(sacha.getByTestId("my-progress")).toHaveText("Il faut 3 pronostics terminés dans ce club pour apparaître.");

  // Aperçu sur la page du club, et accès réservé aux membres.
  await vera.goto(clubUrl);
  await expect(vera.getByTestId("club-top3")).toContainText("Vera");
  await vera.getByRole("link", { name: "Voir le classement" }).click();
  await expect(vera).toHaveURL(/\/classement$/);
  await anon.goto(`${clubUrl}/classement`);
  await expect(anon).toHaveURL(/\/connexion/);
});
