import { type Page, expect, test } from "@playwright/test";
import { checkPage, signUp } from "./helpers";

// Œil « afficher le mot de passe » sur l'inscription, la connexion et le changement de mot de passe.

const eye = (p: Page) => p.getByRole("button", { name: "Afficher le mot de passe" });
const hide = (p: Page) => p.getByRole("button", { name: "Masquer le mot de passe" });

test("inscription : caché par défaut, l'œil affiche puis cache, la saisie est conservée", async ({ page }) => {
  await page.goto("/inscription");
  const field = page.getByLabel("Mot de passe", { exact: true });
  await field.fill("secret-visible-1");
  await expect(field).toHaveAttribute("type", "password");
  await expect(eye(page)).toHaveAttribute("aria-pressed", "false");
  const box = (await eye(page).boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await checkPage(page, "180-inscription-oeil");

  await eye(page).click();
  await expect(field).toHaveAttribute("type", "text");
  await expect(field).toHaveValue("secret-visible-1");
  await expect(hide(page)).toHaveAttribute("aria-pressed", "true");
  await expect(eye(page)).toHaveCount(0);
  await checkPage(page, "181-inscription-oeil-ouvert");

  await hide(page).click();
  await expect(field).toHaveAttribute("type", "password");
  await expect(field).toHaveValue("secret-visible-1");
});

test("inscription : l'œil se commande au clavier (Tab puis Entrée)", async ({ page }) => {
  await page.goto("/inscription");
  await page.waitForLoadState("networkidle"); // un curseur posé avant la fin du chargement de la page serait perdu
  const field = page.getByLabel("Mot de passe", { exact: true });
  await field.focus();
  await page.keyboard.press("Tab");
  await expect(eye(page)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(field).toHaveAttribute("type", "text");
  await expect(hide(page)).toBeFocused(); // le focus reste sur le bouton
  await page.keyboard.press("Enter");
  await expect(field).toHaveAttribute("type", "password");
});

test("inscription refusée : le mot de passe affiché se cache de nouveau", async ({ page }) => {
  await page.goto("/inscription");
  await page.getByLabel("Email").fill("oeil18@club.test");
  await page.getByLabel("Pseudo").fill("Oeil18");
  const field = page.getByLabel("Mot de passe", { exact: true });
  await field.fill("court"); // trop court : refusé par le serveur
  await eye(page).click();
  await expect(field).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "caractères" })).toBeVisible();
  await expect(field).toHaveAttribute("type", "password");
  await expect(eye(page)).toBeVisible();
});

test("connexion : l'œil affiche le mot de passe ; refus = caché de nouveau ; retour sur l'écran = caché", async ({ page }) => {
  await page.goto("/connexion");
  const field = page.getByLabel("Mot de passe", { exact: true });
  await page.getByLabel("Email ou pseudo").fill("personne@club.test");
  await field.fill("mauvais-mot-de-passe");
  await expect(field).toHaveAttribute("type", "password");
  await eye(page).click();
  await expect(field).toHaveAttribute("type", "text");
  await expect(field).toHaveValue("mauvais-mot-de-passe");
  await checkPage(page, "182-connexion-oeil-ouvert");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  await expect(field).toHaveAttribute("type", "password");

  // On quitte l'écran puis on revient : toujours caché.
  await eye(page).click();
  await expect(field).toHaveAttribute("type", "text");
  await page.goto("/inscription");
  await page.goto("/connexion");
  await expect(page.getByLabel("Mot de passe", { exact: true })).toHaveAttribute("type", "password");
});

test("changer de mot de passe : un seul œil pour les deux champs, qui s'affichent ensemble", async ({ page }) => {
  await signUp(page, "Oeil18b");
  await page.goto("/mot-de-passe");
  const nouveau = page.getByLabel("Nouveau mot de passe", { exact: true });
  const confirm = page.getByLabel("Confirmer le mot de passe", { exact: true });
  await nouveau.fill("nouveaumdp18");
  await confirm.fill("nouveaumdp18");
  await expect(nouveau).toHaveAttribute("type", "password");
  await expect(confirm).toHaveAttribute("type", "password");
  await expect(eye(page)).toHaveCount(1); // un seul bouton, pas un par champ
  await checkPage(page, "183-changement-oeil");
  await eye(page).click();
  await expect(nouveau).toHaveAttribute("type", "text");
  await expect(confirm).toHaveAttribute("type", "text");
  await expect(nouveau).toHaveValue("nouveaumdp18");
  await expect(confirm).toHaveValue("nouveaumdp18");
  await hide(page).click();
  await expect(nouveau).toHaveAttribute("type", "password");
  await expect(confirm).toHaveAttribute("type", "password");
});
