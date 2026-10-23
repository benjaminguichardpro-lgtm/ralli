import { type Browser, type Page, expect, test } from "@playwright/test";
import { checkPage, openSection, resetPassword, signIn, signUp, signOut, currentClubId, joinClubById, allowClubCreation } from "./helpers";

// Scénario multi-rôles : Alice (admin), Bob (membre), Carole (extérieure).
// Chaque personne a son propre contexte navigateur (cookies séparés).

test.describe.configure({ mode: "serial" });

let alice: Page;
let bob: Page;
let carole: Page;
let clubUrl: string;
let clubId: string;

async function newPage(browser: Browser) {
  return (await browser.newContext()).newPage();
}

test.beforeAll(async ({ browser }) => {
  alice = await newPage(browser);
  bob = await newPage(browser);
  carole = await newPage(browser);
});

test("accueil déconnecté", async () => {
  await alice.goto("/");
  await expect(alice.getByRole("heading", { name: "Bienvenue sur Ralli" })).toBeVisible();
  await checkPage(alice, "01-accueil-deconnecte");
});

test("le formulaire d'inscription ne demande aucune déclaration d'âge", async () => {
  await alice.goto("/inscription");
  await expect(alice.getByRole("button", { name: "Créer mon compte" })).toBeVisible();
  await expect(alice.getByRole("checkbox")).toHaveCount(0);
  await expect(alice.getByText(/18 ans/)).toHaveCount(0);
  await checkPage(alice, "02-inscription");
});

test("inscription d'Alice : connectée, 1000 Aces", async () => {
  await signUp(alice, "Alice");
  await expect(alice).toHaveURL(/\/$/);
  await expect(alice.getByTestId("nav-user")).toHaveText("Alice");
  await expect(alice.getByTestId("balance")).toHaveText(/^1\s?000 Aces$/);
  await checkPage(alice, "03-accueil-alice");
});

test("pseudo déjà pris (insensible à la casse)", async () => {
  await signUp(carole, "ALICE", { email: "autre@club.test" });
  await expect(carole.getByText("Ce pseudo est déjà pris")).toBeVisible();
  await signUp(carole, "Alice2", { email: "ALICE@club.test" });
  await expect(carole.getByText("Un compte existe déjà avec cet email")).toBeVisible();
});

test("sans demande acceptée, « créer un club » renvoie vers la demande d'admin", async () => {
  await alice.goto("/clubs/nouveau");
  await expect(alice).toHaveURL(/\/clubs\/demande$/);
  await expect(alice.getByRole("heading", { name: "Je suis admin d'un club" })).toBeVisible();
  await alice.getByLabel("Nom complet").fill("Alice Martin");
  await alice.getByLabel("Nom du club").fill("TC Ralli");
  await alice.getByLabel("Ville").fill("Lyon");
  await alice.getByLabel("Fonction dans le club").fill("Présidente");
  await alice.getByLabel("Numéro d'affiliation FFT du club").fill("12345678");
  await alice.getByLabel("Téléphone").fill("06 12 34 56 78");
  await alice.getByRole("button", { name: "Envoyer ma demande" }).click();
  await expect(alice.getByTestId("request-pending")).toBeVisible();
  // En attente : toujours pas de création possible.
  await alice.goto("/clubs/nouveau");
  await expect(alice).toHaveURL(/\/clubs\/demande$/);
});

test("Alice crée un club et peut inviter par WhatsApp", async () => {
  await allowClubCreation();
  await alice.goto("/clubs/nouveau");
  await alice.getByLabel("Nom du club").fill("TC Ralli");
  await alice.getByRole("button", { name: "Créer le club" }).click();
  await expect(alice.getByRole("heading", { name: "TC Ralli" })).toBeVisible();
  await expect(alice.getByText("Votre rôle : admin")).toBeVisible();
  // Plus de code : l'invitation est un lien vers la page du club.
  await expect(alice.getByText("Code d'invitation")).toHaveCount(0);
  clubId = await currentClubId(alice);
  const href = await alice.getByRole("link", { name: "Inviter par WhatsApp" }).getAttribute("href");
  expect(decodeURIComponent(href ?? "")).toContain(`/clubs/${clubId}`);
  clubUrl = alice.url();
  await checkPage(alice, "04-club-admin");
});

test("Bob s'inscrit, rejoint le club d'un bouton, et n'a aucun accès admin", async () => {
  await signUp(bob, "Bob");
  await expect(bob.getByTestId("nav-user")).toHaveText("Bob");
  await joinClubById(bob, clubId);
  await expect(bob.getByRole("heading", { name: "TC Ralli" })).toBeVisible();
  await expect(bob.getByText("Votre rôle : membre")).toBeVisible();
  await expect(bob.getByRole("button", { name: /Nommer admin|Retirer admin|Retirer du club|Accepter/ })).toHaveCount(0);
  await checkPage(bob, "05-club-membre");
});

test("Carole (non membre) consulte le club en lecture seule : ni membres, un bouton pour rejoindre", async () => {
  await signUp(carole, "Carole");
  await expect(carole.getByTestId("nav-user")).toHaveText("Carole");
  await carole.goto(clubUrl);
  // Les clubs sont publics : la page est servie dans un <Suspense>, on attend son contenu.
  await expect(carole.getByTestId("visitor-club")).toBeVisible();
  await expect(carole.getByRole("heading", { name: "TC Ralli" })).toBeVisible();
  await expect(carole.getByTestId("club-followers")).toContainText("personne");
  await expect(carole.getByRole("button", { name: "Rejoindre le club" })).toBeVisible();
  await expect(carole.getByTestId("section-members")).toHaveCount(0);
});

test("pages protégées : redirection vers la connexion si déconnecté", async ({ browser }) => {
  const anon = await newPage(browser);
  await anon.goto(clubUrl);
  // Le lien d'un club ouvert sans compte revient sur ce club après la connexion.
  await expect(anon).toHaveURL(new RegExp(`/connexion\\?club=${clubId}$`));
  await anon.goto("/clubs/nouveau");
  await expect(anon).toHaveURL(/\/connexion$/);
});

test("Alice nomme Bob admin : Bob voit alors les outils d'admin", async () => {
  await alice.goto(clubUrl);
  await openSection(alice, "Membres");
  await alice.getByRole("button", { name: "Nommer admin Bob" }).click();
  await expect(alice.getByRole("button", { name: "Retirer le rôle admin de Bob" })).toBeVisible();
  await bob.goto(clubUrl);
  await expect(bob.getByText("Votre rôle : admin")).toBeVisible();
  await openSection(bob, "Membres");
  await expect(bob.getByRole("button", { name: "Retirer le rôle admin de Alice" })).toBeVisible();
});

test("se retirer soi-même le rôle admin demande confirmation", async () => {
  await bob.goto(clubUrl);
  await expect(bob.getByText("Votre rôle : admin")).toBeVisible();
  await openSection(bob, "Membres");
  const selfButton = bob.getByRole("button", { name: "Retirer le rôle admin de Bob" });

  // Annuler : rien ne change.
  let message = "";
  bob.once("dialog", (d) => {
    message = d.message();
    void d.dismiss();
  });
  await selfButton.click();
  expect(message).toBe("Êtes-vous sûr de vouloir vous retirer le rôle admin ?");
  await bob.reload();
  await expect(bob.getByText("Votre rôle : admin")).toBeVisible();
  await openSection(bob, "Membres"); // la section est repliée après chaque rechargement

  // Confirmer : Bob redevient membre.
  bob.once("dialog", (d) => void d.accept());
  await selfButton.click();
  await expect(bob.getByText("Votre rôle : membre")).toBeVisible();
});

test("retirer le rôle admin d'une autre personne demande aussi confirmation", async () => {
  await alice.goto(clubUrl);
  await openSection(alice, "Membres");
  // Nommer admin : pas de confirmation.
  let promoteDialog = false;
  alice.once("dialog", (d) => {
    promoteDialog = true;
    void d.dismiss();
  });
  await alice.getByRole("button", { name: "Nommer admin Bob" }).click();
  const demote = alice.getByRole("button", { name: "Retirer le rôle admin de Bob" });
  await expect(demote).toBeVisible();
  expect(promoteDialog).toBe(false);
  alice.removeAllListeners("dialog");

  // Annuler : Bob reste admin (vérifié après rechargement).
  let message = "";
  alice.once("dialog", (d) => {
    message = d.message();
    void d.dismiss();
  });
  await demote.click();
  expect(message).toBe("Êtes-vous sûr de vouloir retirer le rôle admin à Bob ?");
  await alice.reload();
  await openSection(alice, "Membres");
  await expect(demote).toBeVisible();

  // Confirmer : Bob redevient membre.
  alice.once("dialog", (d) => void d.accept());
  await demote.click();
  await expect(alice.getByRole("button", { name: "Nommer admin Bob" })).toBeVisible();
});

test("déconnexion puis mauvais mot de passe", async () => {
  await signOut(bob);
  await expect(bob.getByRole("heading", { name: "Bienvenue sur Ralli" })).toBeVisible();
  await signIn(bob, "Bob", "mauvaismdp");
  await expect(bob.getByText("Email, pseudo ou mot de passe incorrect")).toBeVisible();
  await checkPage(bob, "06-connexion-erreur");
  await signIn(bob, "Bob");
  await expect(bob.getByTestId("nav-user")).toHaveText("Bob");
});

test("connexion par pseudo (casse libre) ou par email, même message d'erreur", async () => {
  await signOut(bob);
  await expect(bob.getByRole("heading", { name: "Bienvenue sur Ralli" })).toBeVisible();
  await signIn(bob, "Bob", "Motdepasse-2026!", "  bOB ");
  await expect(bob.getByTestId("nav-user")).toHaveText("Bob");
  await signOut(bob);
  await signIn(bob, "Bob", "mauvaismdp", "Bob");
  await expect(bob.getByText("Email, pseudo ou mot de passe incorrect")).toBeVisible();
  await signIn(bob, "Bob", "Motdepasse-2026!", "pseudo.inconnu");
  await expect(bob.getByText("Email, pseudo ou mot de passe incorrect")).toBeVisible();
  await checkPage(bob, "06b-connexion-pseudo");
  await signIn(bob, "Bob");
  await expect(bob.getByTestId("nav-user")).toHaveText("Bob");
});

test("reset-password : mot de passe temporaire puis changement forcé", async ({ browser }) => {
  const temp = resetPassword("bob@club.test");
  const page = await newPage(browser);
  await signIn(page, "Bob", "Motdepasse-2026!");
  await expect(page.getByText("Email, pseudo ou mot de passe incorrect")).toBeVisible();
  await signIn(page, "Bob", temp);
  await expect(page).toHaveURL(/\/mot-de-passe$/);
  await expect(page.getByText("mot de passe temporaire")).toBeVisible();
  await checkPage(page, "07-mot-de-passe-force");
  // Tant que le mot de passe n'est pas changé, les autres pages renvoient ici.
  await page.goto(clubUrl);
  await expect(page).toHaveURL(/\/mot-de-passe$/);
  await page.getByLabel("Nouveau mot de passe", { exact: true }).fill("Nouveaumdp-2026!");
  await page.getByLabel("Confirmer le mot de passe", { exact: true }).fill("Nouveaumdp-2026!");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByTestId("balance")).toBeVisible();
  await page.goto(clubUrl);
  await expect(page.getByRole("heading", { name: "TC Ralli" })).toBeVisible();
});
