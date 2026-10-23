import { type Browser, type Page, expect, test } from "@playwright/test";
import { awaitServerAction, backdateAccount, checkPage, forceStarted, openSection, placeBet, currentClubId, joinClubById, signUp, allowClubCreation } from "./helpers";

// Guide du premier lancement (Nina17, Omar17) et récapitulatif des pronostics réglés
// (Pia17 admin, Quentin17 capitaine, Oscar17 et Rita17 qui pronostiquent).

test.describe.configure({ mode: "serial" });

const newPage = async (b: Browser) => (await b.newContext()).newPage();
const guide = (p: Page) => p.getByRole("dialog", { name: "Guide de démarrage" });
const recap = (p: Page) => p.getByTestId("results-recap");

let nina: Page, omar: Page, pia: Page, quentin: Page, oscar: Page, rita: Page;
let clubUrl: string, encounterUrl: string;

test.beforeAll(async ({ browser }) => {
  [nina, omar, pia, quentin, oscar, rita] = await Promise.all([newPage(browser), newPage(browser), newPage(browser), newPage(browser), newPage(browser), newPage(browser)]);
});

async function signUpRaw(page: Page, name: string) {
  await page.goto("/inscription");
  await page.getByLabel("Email").fill(`${name.toLowerCase()}@club.test`);
  await page.getByLabel("Pseudo").fill(name);
  await page.getByLabel("Mot de passe", { exact: true }).fill("Motdepasse-2026!");
  await page.getByLabel("Confirmer le mot de passe").fill("Motdepasse-2026!");
  await page.getByRole("button", { name: "Créer mon compte" }).click();
}

const tour = (p: Page) => p.getByRole("dialog", { name: "Visite guidée" });

/** Le cadre doré entoure bien l'élément expliqué (on laisse finir l'animation de déplacement). */
async function expectSpotOn(page: Page, target: string) {
  await expect(async () => {
    const t = (await page.locator(`[data-tour="${target}"]`).boundingBox())!;
    const s = (await page.getByTestId("tour-spot").boundingBox())!;
    // Le cadre entoure l'élément (à 5 px près : il rentre dans l'écran quand l'élément touche un bord).
    expect(s.x).toBeLessThanOrEqual(t.x + 5);
    expect(s.y).toBeLessThanOrEqual(t.y + 5);
    expect(s.x + s.width).toBeGreaterThanOrEqual(t.x + t.width - 5);
    expect(s.y + s.height).toBeGreaterThanOrEqual(t.y + t.height - 5);
    // Coins arrondis au moins comme la bulle (16 px).
    const radius = await page.getByTestId("tour-spot").evaluate((e) => parseFloat(getComputedStyle(e).borderTopLeftRadius));
    expect(radius).toBeGreaterThanOrEqual(16);
    // …et reste entièrement visible à l'écran.
    const vp = page.viewportSize()!;
    expect(s.x).toBeGreaterThanOrEqual(3);
    expect(s.y).toBeGreaterThanOrEqual(3);
    expect(s.x + s.width).toBeLessThanOrEqual(vp.width - 3);
    expect(s.y + s.height).toBeLessThanOrEqual(vp.height - 3);
    // …et ne déborde pas largement (marge du cadre : quelques pixels).
    expect(t.x - s.x).toBeLessThan(12);
    expect(t.y - s.y).toBeLessThan(12);
  }).toPass({ timeout: 5000 });
}

async function expectStep(page: Page, n: number, title: string, target: string) {
  await expect(page.getByTestId("tour-counter")).toHaveText(`${n}/6`);
  await expect(page.getByTestId("tour-title")).toHaveText(title);
  await expectSpotOn(page, target);
}

test("guide : écran d'accueil, puis visite des 6 éléments (compte sans club), puis plus jamais", async () => {
  await signUpRaw(nina, "Nina17");
  await expect(guide(nina)).toBeVisible();
  await expect(nina.getByTestId("onboarding-title")).toHaveText("Tu as 1 000 Aces");
  await expect(nina.getByTestId("onboarding-text")).toContainText("monnaie virtuelle de Ralli, et la seule monnaie du jeu");
  await expect(nina.getByTestId("onboarding-text")).toContainText("Aucun vrai argent n'est en jeu ici");
  await checkPage(nina, "170-guide-accueil");
  await nina.getByRole("button", { name: "Faire la visite" }).click();
  await expect(guide(nina)).toBeHidden();

  await expect(tour(nina)).toBeVisible();
  await expectStep(nina, 1, "Ton solde", "solde");
  await expect(nina.getByTestId("tour-text")).toHaveText("Tes Aces. Ils baissent quand tu engages un pronostic et montent quand tu as raison.");
  await expect(tour(nina).getByRole("button", { name: "Précédent" })).toHaveCount(0); // rien avant la première étape
  await checkPage(nina, "171-visite-solde");
  await tour(nina).getByRole("button", { name: "Suivant" }).click();
  await expectStep(nina, 2, "Matchs", "matchs");
  await expect(nina.getByTestId("tour-text")).toContainText("Ici tu verras les rencontres de ton club"); // compte sans club
  await checkPage(nina, "172-visite-matchs");
  await tour(nina).getByRole("button", { name: "Suivant" }).click();
  await expectStep(nina, 3, "Mes rallis", "rallis");
  await expect(nina.getByTestId("tour-text")).toContainText("Ici tu verras tes rallis, en cours puis terminés");
  await tour(nina).getByRole("button", { name: "Suivant" }).click();
  await expectStep(nina, 4, "Classement", "classement");
  await expect(nina.getByTestId("tour-text")).toContainText("une fois que tu en auras rejoint un");

  // « Précédent » revient en arrière.
  await tour(nina).getByRole("button", { name: "Précédent" }).click();
  await expectStep(nina, 3, "Mes rallis", "rallis");
  await tour(nina).getByRole("button", { name: "Suivant" }).click();
  await tour(nina).getByRole("button", { name: "Suivant" }).click();
  await expectStep(nina, 5, "Clubs", "club");
  await expect(nina.getByTestId("tour-text")).toContainText("Cherche ton club, regarde ses rencontres à venir et rejoins-le d'un bouton");
  await tour(nina).getByRole("button", { name: "Suivant" }).click();
  await expectStep(nina, 6, "Ton profil", "profil");
  await expect(tour(nina).getByRole("button", { name: "Passer" })).toHaveCount(0); // « Terminer » prend sa place
  await checkPage(nina, "173-visite-profil");
  await awaitServerAction(nina, () => tour(nina).getByRole("button", { name: "Terminer" }).click());
  await expect(tour(nina)).toBeHidden();
  await nina.reload();
  await nina.waitForTimeout(800);
  await expect(guide(nina)).toHaveCount(0);
  await expect(tour(nina)).toHaveCount(0);
  await expect(nina.getByTestId("nav-user")).toHaveText("Nina17");
});

test("guide : « Passer » ferme tout dès l'accueil ; « Revoir le guide » rejoue sans rien changer ; Échap ferme la visite ; une étape introuvable est sautée", async () => {
  await signUpRaw(omar, "Omar17");
  await expect(guide(omar)).toBeVisible();
  await awaitServerAction(omar, () => guide(omar).getByRole("button", { name: "Passer" }).click());
  await expect(guide(omar)).toBeHidden();
  await omar.goto("/");
  await omar.waitForTimeout(800);
  await expect(guide(omar)).toHaveCount(0);
  await expect(tour(omar)).toHaveCount(0);

  await omar.goto("/profil");
  // « Revoir le guide » est sur sa propre ligne, sous « Changer de mot de passe » (et non collé à côté).
  const pwd = (await omar.getByRole("link", { name: "Changer de mot de passe" }).boundingBox())!;
  const replay = (await omar.getByRole("button", { name: "Revoir le guide" }).boundingBox())!;
  expect(replay.y).toBeGreaterThanOrEqual(pwd.y + pwd.height);
  await omar.getByRole("button", { name: "Revoir le guide" }).click();
  await expect(guide(omar)).toBeVisible();
  await omar.getByRole("button", { name: "Faire la visite" }).click();
  await expectStep(omar, 1, "Ton solde", "solde"); // sur la page du profil, la barre et l'en-tête sont là aussi

  // Une étape dont l'élément est introuvable est sautée, l'écran n'est pas bloqué : « Mes rallis » disparaît ici.
  await omar.evaluate(() => document.querySelector('[data-tour="rallis"]')!.removeAttribute("data-tour"));
  await tour(omar).getByRole("button", { name: "Suivant" }).click();
  await tour(omar).getByRole("button", { name: "Suivant" }).click(); // l'étape 3 est introuvable : on passe directement à la 4
  await expectStep(omar, 4, "Classement", "classement");
  await tour(omar).getByRole("button", { name: "Suivant" }).click();
  await expectStep(omar, 5, "Clubs", "club");

  await omar.keyboard.press("Escape");
  await expect(tour(omar)).toBeHidden();
  await omar.reload();
  await omar.waitForTimeout(800);
  await expect(guide(omar)).toHaveCount(0);
  await expect(tour(omar)).toHaveCount(0);
  await checkPage(omar, "174-profil-revoir-guide");
});

test("visite : avec « réduire les animations », le cadre se déplace sans transition", async () => {
  await omar.emulateMedia({ reducedMotion: "reduce" });
  await omar.goto("/profil");
  await omar.getByRole("button", { name: "Revoir le guide" }).click();
  await omar.getByRole("button", { name: "Faire la visite" }).click();
  await expect(omar.getByTestId("tour-spot")).toBeVisible();
  await expect(omar.getByTestId("tour-spot")).toHaveCSS("transition-duration", "0s");
  await omar.keyboard.press("Escape");
  await omar.emulateMedia({ reducedMotion: "no-preference" });
  await omar.goto("/profil");
  await omar.getByRole("button", { name: "Revoir le guide" }).click();
  await omar.getByRole("button", { name: "Faire la visite" }).click();
  await expect(omar.getByTestId("tour-spot")).not.toHaveCSS("transition-duration", "0s");
  await omar.keyboard.press("Escape");
});

test("mise en place : club, équipe, rencontre publiée, pronostics d'Oscar et de Rita", async () => {
  await signUp(pia, "Pia17");
  await allowClubCreation();
  await pia.goto("/clubs/nouveau");
  await pia.getByLabel("Nom du club").fill("TC Récap17");
  await pia.getByRole("button", { name: "Créer le club" }).click();
  const code = await currentClubId(pia);
  clubUrl = pia.url();
  for (const [page, name] of [[quentin, "Quentin17"], [oscar, "Oscar17"], [rita, "Rita17"]] as const) {
    await signUp(page, name);
    await joinClubById(page, code);
    await expect(page.getByText(/Votre rôle/)).toBeVisible();
  }

  await pia.goto(clubUrl);
  await openSection(pia, "Équipes du club");
  await pia.getByText("Créer une équipe").click();
  await pia.getByLabel("Nom de l'équipe", { exact: true }).fill("Messieurs 1");
  await pia.getByLabel("Capitaine").selectOption({ label: "Quentin17" });
  await pia.getByRole("button", { name: "Créer l'équipe" }).click();
  const addPlayer = async (first: string, last: string, rank: string) => {
    const form = pia.getByTestId("add-player");
    await form.getByLabel("Prénom").fill(first);
    await form.getByLabel("Nom", { exact: true }).fill(last);
    await form.getByLabel("Niveau FFT").selectOption({ label: rank });
    await form.getByRole("button", { name: "Ajouter le joueur" }).click();
    await expect(form.getByText(`${first} ${last} ajouté(e) à l'équipe.`)).toBeVisible();
  };
  await addPlayer("Léa", "Martin", "30");
  await addPlayer("Hugo", "Durand", "30/1");
  await pia.goto(clubUrl);
  await openSection(pia, "Équipes adverses");
  await pia.getByText("Ajouter une équipe adverse").click();
  await pia.getByLabel("Club adverse").fill("TC Voisin");
  await pia.getByLabel("Nom de l'équipe adverse").fill("TC Voisin 1");
  await pia.getByRole("button", { name: "Ajouter l'équipe adverse" }).click();
  await addPlayer("Paul", "Voisin", "30/1");
  await addPlayer("Marc", "Lenoir", "30/2");

  await quentin.goto(`${clubUrl}/rencontres/nouvelle`);
  await quentin.getByLabel("Adversaire").selectOption({ label: "TC Voisin 1" });
  await quentin.getByLabel("Date et heure de début").fill("2027-04-11T14:00");
  await quentin.getByRole("button", { name: "Créer le brouillon" }).click();
  await expect(quentin.getByText("Brouillon", { exact: true })).toBeVisible();
  encounterUrl = quentin.url();
  const pairs = [["Léa Martin (30)", "Paul Voisin (30/1)"], ["Hugo Durand (30/1)", "Marc Lenoir (30/2)"]] as const;
  for (const [i, [home, away]] of pairs.entries()) {
    const add = quentin.getByTestId("add-match");
    await add.getByLabel("Joueur domicile").selectOption({ label: home });
    await add.getByLabel("Joueur extérieur").selectOption({ label: away });
    await add.getByRole("button", { name: "Ajouter le match" }).click();
    await expect(quentin.getByTestId("matches").locator("li")).toHaveCount(i + 1);
  }
  quentin.once("dialog", (d) => void d.accept());
  await quentin.getByRole("button", { name: "Publier la rencontre" }).click();
  await expect(quentin.getByText("Pronostics ouverts", { exact: true })).toBeVisible();

  // Message WhatsApp de la rencontre : équipes, jour et heure, invitation à pronostiquer, lien de la page.
  const share = quentin.getByRole("link", { name: "Partager la rencontre" });
  const text = decodeURIComponent((await share.getAttribute("href"))!.split("text=")[1]!);
  expect(text).toContain("TC Récap17 · Messieurs 1 – TC Voisin 1");
  expect(text).toContain("dimanche 11 avril");
  expect(text).toContain("à 14");
  expect(text).toContain("Fais ton pronostic sur Ralli (jeu gratuit, sans argent réel) :");
  expect(text).toContain(new URL(encounterUrl).pathname);

  const bet = async (page: Page, n: number, pick: RegExp, aces: string) => {
    await page.goto(encounterUrl);
    await placeBet(page, page.getByTestId("matches").locator("li").nth(n), pick, aces);
    await expect(page.getByTestId("my-prediction").first()).toBeVisible();
  };
  await bet(oscar, 0, /Léa Martin gagne/, "100"); // sera gagné
  await bet(oscar, 1, /Hugo Durand gagne/, "40"); // sera perdu
  await bet(rita, 0, /Paul Voisin gagne/, "100"); // perdu
  await bet(rita, 1, /Hugo Durand gagne/, "40"); // perdu
  // Rien n'est réglé : pas de récapitulatif.
  await oscar.goto("/");
  await oscar.waitForTimeout(800);
  await expect(recap(oscar)).toHaveCount(0);
});

test("règlement : Quentin propose, Pia confirme", async () => {
  await backdateAccount("Oscar17", 1); // pour voir l'ordre des fenêtres : récapitulatif, puis bonus de connexion
  await forceStarted(encounterUrl);
  await quentin.goto(encounterUrl);
  const box = quentin.getByTestId("propose-score");
  await box.locator("summary").click();
  await box.getByLabel("Vainqueur du simple 1").selectOption({ label: "Léa Martin" });
  await box.getByLabel("Vainqueur du simple 2").selectOption({ label: "Marc Lenoir" });
  quentin.once("dialog", (d) => void d.accept());
  await box.getByRole("button", { name: "Proposer le score" }).click();
  await expect(quentin.getByText("Score proposé", { exact: true })).toBeVisible();
  await pia.goto(encounterUrl);
  pia.once("dialog", (d) => void d.accept());
  await pia.getByRole("button", { name: "Confirmer le score" }).click();
  await expect(pia.getByText("Terminée", { exact: true })).toBeVisible();
});

test("Oscar : récapitulatif gagnant, détail, pluie d'or, puis le bonus de connexion ; plus rien ensuite", async () => {
  await oscar.goto("/");
  await expect(recap(oscar)).toBeVisible();
  await expect(oscar.getByTestId("daily-bonus")).toHaveCount(0); // jamais deux fenêtres à la fois
  await expect(oscar.getByTestId("recap-total")).toHaveText("+156 Aces");
  await expect(oscar.getByTestId("recap-summary")).toHaveText("1 pronostic juste sur 2. Bravo !");
  const won = recap(oscar).locator('[data-status="WON"]');
  const lost = recap(oscar).locator('[data-status="LOST"]');
  await expect(won).toContainText("Léa Martin contre Paul Voisin");
  await expect(won).toContainText("tu avais choisi Léa Martin (100 Aces engagés)");
  await expect(won).toContainText("Gagné : +156 Aces");
  await expect(lost).toContainText("Perdu");
  await expect(recap(oscar).getByRole("link", { name: /TC Récap17/ })).toHaveAttribute("href", /\/rencontres\//);
  await expect(recap(oscar).locator(".gold-rain")).toBeVisible();
  await checkPage(oscar, "173-recapitulatif-gagnant");

  // « Réduire les animations » : la pluie d'or disparaît, le texte reste.
  await oscar.emulateMedia({ reducedMotion: "reduce" });
  await expect(recap(oscar).locator(".gold-rain")).toBeHidden();
  await oscar.emulateMedia({ reducedMotion: "no-preference" });

  await awaitServerAction(oscar, () => recap(oscar).getByRole("button", { name: "Super" }).click());
  await expect(recap(oscar)).toBeHidden();
  // La fenêtre suivante prend sa place : le bonus du jour (compte ancien).
  await expect(oscar.getByTestId("daily-bonus")).toBeVisible();
  await oscar.getByTestId("daily-bonus").getByRole("button", { name: "Super" }).click();

  await oscar.reload();
  await oscar.waitForTimeout(800);
  await expect(recap(oscar)).toHaveCount(0);
  await oscar.goto("/portefeuille");
  await oscar.waitForTimeout(800);
  await expect(recap(oscar)).toHaveCount(0);
});

test("Rita : récapitulatif sobre, sans pluie d'or ; il ne revient pas après fermeture par Échap", async () => {
  await rita.goto("/");
  await expect(recap(rita)).toBeVisible();
  await expect(rita.getByTestId("recap-total")).toHaveText("Pas cette fois");
  await expect(rita.getByTestId("recap-summary")).toContainText("Aucun pronostic juste");
  await expect(recap(rita).locator('[data-status="LOST"]')).toHaveCount(2);
  await expect(recap(rita).locator(".gold-rain")).toHaveCount(0);
  await checkPage(rita, "174-recapitulatif-perdant");
  await awaitServerAction(rita, () => rita.keyboard.press("Escape"));
  await expect(recap(rita)).toBeHidden();
  await rita.reload();
  await rita.waitForTimeout(800);
  await expect(recap(rita)).toHaveCount(0);
});

test("un membre sans pronostic réglé (Quentin, capitaine) ne voit aucun récapitulatif", async () => {
  await quentin.goto("/");
  await quentin.waitForTimeout(800);
  await expect(recap(quentin)).toHaveCount(0);
});

test("un membre de club rejoue la visite depuis son profil : textes « avec club », « Passer » en cours de route, rien d'enregistré", async () => {
  await oscar.goto("/profil");
  await oscar.getByRole("button", { name: "Revoir le guide" }).click();
  await oscar.getByRole("button", { name: "Faire la visite" }).click();
  await tour(oscar).getByRole("button", { name: "Suivant" }).click();
  await expectStep(oscar, 2, "Matchs", "matchs");
  await expect(oscar.getByTestId("tour-text")).toHaveText(
    "Les rencontres et tournois à venir, et les derniers résultats. Règle la distance pour voir plus loin que tes clubs. Touche une rencontre, puis la cote du joueur que tu penses gagnant, choisis ton montant et valide ton ralli.",
  );
  await tour(oscar).getByRole("button", { name: "Suivant" }).click();
  await expect(oscar.getByTestId("tour-text")).toHaveText("Tes rallis en cours et terminés : gagné, perdu ou remboursé, avec ton bilan et l'historique de tes Aces. Cherche un match précis avec la barre de recherche.");
  await tour(oscar).getByRole("button", { name: "Suivant" }).click();
  await expect(oscar.getByTestId("tour-text")).toHaveText("Ta place parmi les membres de ton club, selon tes résultats.");
  await tour(oscar).getByRole("button", { name: "Suivant" }).click();
  await expect(oscar.getByTestId("tour-text")).toHaveText("Cherche n'importe quel club par son nom, sa ville ou sur la carte, regarde ses rencontres à venir et rejoins-le d'un bouton. Tes clubs sont dans ton profil.");
  await checkPage(oscar, "175-visite-club");
  await tour(oscar).getByRole("button", { name: "Passer" }).click();
  await expect(tour(oscar)).toBeHidden();
  await oscar.reload();
  await oscar.waitForTimeout(800);
  await expect(tour(oscar)).toHaveCount(0);
  await expect(guide(oscar)).toHaveCount(0);
});
