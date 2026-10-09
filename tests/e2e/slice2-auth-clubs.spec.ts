import { type Browser, type Page, expect, test } from "@playwright/test";
import { checkPage, resetPassword, signIn, signUp, signOut, revealInviteCode } from "./helpers";

// Scénario multi-rôles : Alice (admin), Bob (membre), Carole (extérieure).
// Chaque personne a son propre contexte navigateur (cookies séparés).

test.describe.configure({ mode: "serial" });

let alice: Page;
let bob: Page;
let carole: Page;
let clubUrl: string;
let inviteCode: string;

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

test("inscription refusée sans la case 18+ (contrôle serveur)", async () => {
  await signUp(alice, "Alice", { checkAge: false });
  await expect(alice.getByText("Vous devez avoir 18 ans ou plus pour vous inscrire")).toBeVisible();
  await expect(alice).toHaveURL(/\/inscription$/);
  await checkPage(alice, "02-inscription-refus-18");
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

test("Alice crée un club et voit le code d'invitation", async () => {
  await alice.goto("/clubs/nouveau");
  await alice.getByLabel("Nom du club").fill("TC Ralli");
  await alice.getByRole("button", { name: "Créer le club" }).click();
  await expect(alice.getByRole("heading", { name: "TC Ralli" })).toBeVisible();
  await expect(alice.getByText("Votre rôle : admin")).toBeVisible();
  // Le code reste caché tant qu'on n'a pas appuyé sur le bouton, et se recache à la demande.
  await expect(alice.getByTestId("invite-code")).toHaveCount(0);
  await expect(alice.getByRole("button", { name: "Révéler le code d'invitation" })).toBeVisible();
  inviteCode = await revealInviteCode(alice);
  expect(inviteCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  await alice.getByRole("button", { name: "Masquer le code d'invitation" }).click();
  await expect(alice.getByTestId("invite-code")).toHaveCount(0);
  expect(inviteCode).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);
  clubUrl = alice.url();
  await checkPage(alice, "04-club-admin");
});

test("Bob s'inscrit, rejoint avec le code, et n'a aucun accès admin", async () => {
  await signUp(bob, "Bob");
  await expect(bob.getByTestId("nav-user")).toHaveText("Bob");
  await bob.goto("/clubs/rejoindre");
  await bob.getByLabel("Code d'invitation").fill("ZZZZZZ");
  await bob.getByRole("button", { name: "Rejoindre" }).click();
  await expect(bob.getByText("Code d'invitation invalide")).toBeVisible();

  await bob.getByLabel("Code d'invitation").fill(inviteCode.toLowerCase());
  await bob.getByRole("button", { name: "Rejoindre" }).click();
  await expect(bob.getByRole("heading", { name: "TC Ralli" })).toBeVisible();
  await expect(bob.getByText("Votre rôle : membre")).toBeVisible();
  await expect(bob.getByTestId("invite-code")).toHaveCount(0);
  await expect(bob.getByRole("button", { name: /Nommer admin|Retirer admin|nouveau code/ })).toHaveCount(0);
  await checkPage(bob, "05-club-membre");
});

test("Carole (non membre) obtient une 404 sur l'URL du club", async () => {
  await signUp(carole, "Carole");
  await expect(carole.getByTestId("nav-user")).toHaveText("Carole");
  await carole.goto(clubUrl);
  // Le contrôle d'accès s'exécute dans un <Suspense> streamé : l'en-tête HTTP (200) part avant.
  // On vérifie donc le contenu servi, qui est la page « introuvable » sans aucune donnée du club.
  await expect(carole.getByRole("heading", { name: "Page introuvable" })).toBeVisible();
  await expect(carole.getByTestId("invite-code")).toHaveCount(0);
  await expect(carole.getByText("TC Ralli")).toHaveCount(0);
});

test("pages protégées : redirection vers la connexion si déconnecté", async ({ browser }) => {
  const anon = await newPage(browser);
  await anon.goto(clubUrl);
  await expect(anon).toHaveURL(/\/connexion$/);
  await anon.goto("/clubs/nouveau");
  await expect(anon).toHaveURL(/\/connexion$/);
});

test("Alice nomme Bob admin : Bob voit alors le code", async () => {
  await alice.goto(clubUrl);
  await alice.getByRole("button", { name: "Nommer admin Bob" }).click();
  await expect(alice.getByRole("button", { name: "Retirer le rôle admin de Bob" })).toBeVisible();
  await bob.goto(clubUrl);
  await expect(bob.getByText("Votre rôle : admin")).toBeVisible();
  expect(await revealInviteCode(bob)).toBe(inviteCode);
});

test("régénérer le code invalide l'ancien", async () => {
  await alice.goto(clubUrl);
  await alice.getByRole("button", { name: "Générer un nouveau code" }).click();
  await expect(alice.getByText("Nouveau code généré. L'ancien ne fonctionne plus.")).toBeVisible();
  const fresh = await revealInviteCode(alice);
  expect(fresh).not.toBe(inviteCode);

  await carole.goto("/clubs/rejoindre");
  await carole.getByLabel("Code d'invitation").fill(inviteCode);
  await carole.getByRole("button", { name: "Rejoindre" }).click();
  await expect(carole.getByText("Code d'invitation invalide")).toBeVisible();
  await carole.getByLabel("Code d'invitation").fill(fresh);
  await carole.getByRole("button", { name: "Rejoindre" }).click();
  await expect(carole.getByText("Votre rôle : membre")).toBeVisible();
});

test("se retirer soi-même le rôle admin demande confirmation", async () => {
  await bob.goto(clubUrl);
  await expect(bob.getByText("Votre rôle : admin")).toBeVisible();
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

  // Confirmer : Bob redevient membre.
  bob.once("dialog", (d) => void d.accept());
  await selfButton.click();
  await expect(bob.getByText("Votre rôle : membre")).toBeVisible();
});

test("retirer le rôle admin d'une autre personne demande aussi confirmation", async () => {
  await alice.goto(clubUrl);
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
  await signIn(bob, "Bob", "motdepasse", "  bOB ");
  await expect(bob.getByTestId("nav-user")).toHaveText("Bob");
  await signOut(bob);
  await signIn(bob, "Bob", "mauvaismdp", "Bob");
  await expect(bob.getByText("Email, pseudo ou mot de passe incorrect")).toBeVisible();
  await signIn(bob, "Bob", "motdepasse", "pseudo.inconnu");
  await expect(bob.getByText("Email, pseudo ou mot de passe incorrect")).toBeVisible();
  await checkPage(bob, "06b-connexion-pseudo");
  await signIn(bob, "Bob");
  await expect(bob.getByTestId("nav-user")).toHaveText("Bob");
});

test("reset-password : mot de passe temporaire puis changement forcé", async ({ browser }) => {
  const temp = resetPassword("bob@club.test");
  const page = await newPage(browser);
  await signIn(page, "Bob", "motdepasse");
  await expect(page.getByText("Email, pseudo ou mot de passe incorrect")).toBeVisible();
  await signIn(page, "Bob", temp);
  await expect(page).toHaveURL(/\/mot-de-passe$/);
  await expect(page.getByText("mot de passe temporaire")).toBeVisible();
  await checkPage(page, "07-mot-de-passe-force");
  // Tant que le mot de passe n'est pas changé, les autres pages renvoient ici.
  await page.goto(clubUrl);
  await expect(page).toHaveURL(/\/mot-de-passe$/);
  await page.getByLabel("Nouveau mot de passe").fill("nouveaumdp1");
  await page.getByLabel("Confirmer le mot de passe").fill("nouveaumdp1");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByTestId("balance")).toBeVisible();
  await page.goto(clubUrl);
  await expect(page.getByRole("heading", { name: "TC Ralli" })).toBeVisible();
});
