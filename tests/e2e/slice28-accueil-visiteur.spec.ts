import { expect, test } from "@playwright/test";
import { checkPage } from "./helpers";

// Pages du visiteur non connecté : grande carte verte rayée, sans en-tête ni pied de page habituels.

test("accueil du visiteur : logo, slogan, boutons, lien pour inscrire son club", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Bienvenue sur Ralli" })).toBeAttached();
  await expect(page.getByText("Les tournois de ton club, les pronostics de tes amis.")).toBeVisible();
  await expect(page.getByText("Jeu gratuit, Aces sans valeur réelle.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Créer mon compte" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Se connecter" })).toBeVisible();
  await expect(page.getByText("Tu organises des tournois ?")).toBeVisible();
  await expect(page.getByRole("link", { name: "Inscrire mon club" })).toHaveAttribute("href", "/inscription");
  // L'en-tête et le pied de page habituels sont masqués ; les couleurs viennent du thème (carte rayée).
  await expect(page.locator("body > header")).toBeHidden();
  await expect(page.locator("body > footer")).toBeHidden();
  await expect(page.locator(".lawn")).toBeVisible();
  await checkPage(page, "accueil-visiteur");
});

test("les boutons mènent à l'inscription et à la connexion, le logo ramène à l'accueil", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Créer mon compte" }).click();
  await expect(page).toHaveURL(/\/inscription$/);
  await expect(page.getByRole("heading", { name: "Créer un compte" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Créer mon compte" })).toBeVisible();
  await checkPage(page, "inscription-visiteur");
  await page.getByRole("link", { name: "Retour à l'accueil de Ralli" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole("link", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/connexion$/);
  await expect(page.getByRole("heading", { name: "Se connecter" })).toBeVisible();
  await expect(page.getByLabel("Email ou pseudo")).toBeVisible();
  await checkPage(page, "connexion-visiteur");
});

test("sur un petit écran (360 px) : aucun défilement horizontal, boutons d'au moins 44 px", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 } });
  const page = await ctx.newPage();
  for (const path of ["/", "/connexion", "/inscription"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
  await page.goto("/");
  for (const name of ["Créer mon compte", "Se connecter"]) {
    const box = (await page.getByRole("link", { name }).boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await ctx.close();
});

test("« Comment ça marche » : page publique en 6 étapes et règles du jeu, sans mot interdit", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Comment ça marche" }).click();
  await expect(page).toHaveURL(/\/comment-ca-marche$/);
  await expect(page.getByRole("heading", { name: "Comment ça marche", level: 1 })).toBeVisible();
  await expect(page.getByTestId("how-step")).toHaveCount(6);
  await expect(page.getByTestId("how-step").nth(3)).toContainText("1 000 Aces à l'inscription");
  await expect(page.getByTestId("how-step").nth(3)).toContainText("+10 Aces chaque jour");
  await expect(page.getByTestId("how-step").nth(3)).toContainText("+50 de plus tous les 7 jours d'affilée");
  await expect(page.getByTestId("how-step").nth(3)).toContainText("+200 Aces chaque lundi si tu en as moins de 500");
  await expect(page.getByTestId("how-rules")).toContainText("aucune valeur");
  await checkPage(page, "comment-ca-marche");
  await page.getByRole("link", { name: "Créer mon compte" }).click();
  await expect(page).toHaveURL(/\/inscription$/);
});
