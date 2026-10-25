import { type Browser, expect, test } from "@playwright/test";
import { resetPassword, signIn, signUp } from "./helpers";

// Révocation des connexions : un changement de mot de passe déconnecte les autres appareils, pas celui qui change.

const newPage = async (browser: Browser) => (await browser.newContext()).newPage();

test("réinitialiser le mot de passe déconnecte les autres appareils, le nouveau reste ouvert", async ({ browser }) => {
  const phone = await newPage(browser);
  await signUp(phone, "Sessia");
  await expect(phone.getByTestId("nav-user")).toHaveText("Sessia");

  const laptop = await newPage(browser);
  await signIn(laptop, "Sessia");
  await expect(laptop.getByTestId("nav-user")).toHaveText("Sessia");

  const temp = resetPassword("sessia@club.test");

  // Les deux anciennes connexions sont révoquées.
  await phone.goto("/");
  await expect(phone.getByTestId("nav-user")).toHaveCount(0);
  await laptop.goto("/");
  await expect(laptop.getByTestId("nav-user")).toHaveCount(0);

  // Connexion avec le mot de passe temporaire, puis changement : cet appareil reste connecté.
  await signIn(laptop, "Sessia", temp);
  await expect(laptop).toHaveURL(/\/mot-de-passe$/);
  await laptop.getByLabel("Nouveau mot de passe", { exact: true }).fill("Nouveaumdp-2026!");
  await laptop.getByLabel("Confirmer le mot de passe", { exact: true }).fill("Nouveaumdp-2026!");
  await laptop.getByRole("button", { name: "Enregistrer" }).click();
  await expect(laptop.getByTestId("balance")).toBeVisible();
  await laptop.goto("/");
  await expect(laptop.getByTestId("nav-user")).toHaveText("Sessia");
  await laptop.reload();
  await expect(laptop.getByTestId("nav-user")).toHaveText("Sessia");

  // Le téléphone, toujours avec son ancienne connexion, reste dehors.
  await phone.goto("/");
  await expect(phone.getByTestId("nav-user")).toHaveCount(0);
});
