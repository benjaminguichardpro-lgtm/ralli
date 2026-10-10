import { type Page, expect, test } from "@playwright/test";
import sharp from "sharp";
import { checkPage, signUp } from "./helpers";

// Messages des formulaires (pastille verte avec coche pour une réussite, rouge avec « ! » pour une erreur) : Gina19 sur son profil.

test.describe.configure({ mode: "serial" });

let gina: Page;
const form = () => gina.getByTestId("photo-upload");
const status = () => form().getByRole("status");
const alert = () => form().getByRole("alert");

const photo = () => sharp({ create: { width: 64, height: 64, channels: 3, background: "#2b7a4b" } }).jpeg().toBuffer();
async function upload(file: { name: string; mimeType: string; buffer: Buffer }) {
  const chooser = gina.waitForEvent("filechooser");
  await form().getByRole("button", { name: "Importer une photo" }).click();
  await (await chooser).setFiles(file);
}

test.beforeAll(async ({ browser }) => {
  gina = await (await browser.newContext()).newPage();
  await signUp(gina, "Gina19");
  await gina.goto("/profil");
});

test("réussite : pastille verte avec coche, texte, disparaît toute seule après 4 secondes", async () => {
  await upload({ name: "moi.jpg", mimeType: "image/jpeg", buffer: await photo() });
  await expect(status()).toBeVisible();
  await expect(status()).toHaveText("Photo enregistrée.");
  await expect(status()).toHaveAttribute("data-tone", "ok");
  // Pastille verte (couleur « gagné » du thème) avec une coche tracée.
  const badge = status().locator(".form-message-badge");
  expect(await badge.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(43, 122, 75)");
  await expect(status().locator("path.form-message-draw")).toHaveAttribute("d", "M5 12.5l4.5 4.5L19 7.5");
  await gina.waitForTimeout(900);
  await checkPage(gina, "190-message-reussite");
  const shownAt = Date.now();
  await expect(status()).toHaveCount(0, { timeout: 8000 });
  const lasted = Date.now() - shownAt;
  expect(lasted).toBeGreaterThan(2500); // elle est restée lisible un moment…
  expect(lasted).toBeLessThan(6500); // …puis a disparu (autour de 4 s)
});

test("le même message reçu deux fois rejoue l'animation et repart pour 4 secondes", async () => {
  await upload({ name: "moi.jpg", mimeType: "image/jpeg", buffer: await photo() });
  await expect(status()).toBeVisible();
  await status().evaluate((e) => ((e as HTMLElement & { marque?: string }).marque = "premier"));
  await gina.waitForTimeout(1500);
  await upload({ name: "moi2.jpg", mimeType: "image/jpeg", buffer: await photo() });
  // Un message tout neuf (pas la marque du précédent), toujours visible 2,5 s après sa réception.
  await expect(async () => expect(await status().evaluate((e) => (e as HTMLElement & { marque?: string }).marque)).toBeUndefined()).toPass({ timeout: 5000 });
  await gina.waitForTimeout(2500);
  await expect(status()).toBeVisible(); // le délai de 4 s a bien repris à zéro (sinon il aurait disparu à 4 s après le premier)
  await expect(status()).toHaveCount(0, { timeout: 8000 });
});

test("erreur : pastille rouge avec « ! », reste affichée (ne disparaît pas toute seule)", async () => {
  await upload({ name: "faux.png", mimeType: "image/png", buffer: Buffer.from("ceci n'est pas une image") });
  await expect(alert()).toBeVisible();
  await expect(alert()).toHaveAttribute("data-tone", "error");
  await expect(alert()).toContainText(/illisible|Format non pris en charge/);
  const badge = alert().locator(".form-message-badge");
  expect(await badge.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(179, 38, 30)");
  await expect(alert().locator("path.form-message-draw")).toHaveAttribute("d", "M12 6v7M12 18v.5");
  await gina.waitForTimeout(900); // laisse finir l'animation avant la capture d'écran
  await checkPage(gina, "191-message-erreur");
  await gina.waitForTimeout(6000);
  await expect(alert()).toBeVisible(); // toujours là bien après 4 s
});

test("avec « réduire les animations » : aucun mouvement, le message est tout de suite lisible", async () => {
  await gina.emulateMedia({ reducedMotion: "reduce" });
  await gina.goto("/profil");
  await upload({ name: "moi3.jpg", mimeType: "image/jpeg", buffer: await photo() });
  await expect(status()).toBeVisible();
  const names = await status().evaluate((e) => [getComputedStyle(e).animationName, getComputedStyle(e.querySelector(".form-message-badge")!).animationName, getComputedStyle(e.querySelector(".form-message-text")!).animationName]);
  expect(names).toEqual(["none", "none", "none"]);
  // La coche est entièrement tracée, sans attendre une animation.
  expect(await status().locator("path.form-message-draw").evaluate((e) => getComputedStyle(e).strokeDashoffset)).toBe("0px");
  await gina.emulateMedia({ reducedMotion: "no-preference" });
});

test("sans « réduire les animations » : les animations sont bien présentes", async () => {
  await gina.goto("/profil");
  await upload({ name: "moi4.jpg", mimeType: "image/jpeg", buffer: await photo() });
  await expect(status()).toBeVisible();
  const names = await status().evaluate((e) => [getComputedStyle(e).animationName, getComputedStyle(e.querySelector(".form-message-badge")!).animationName]);
  expect(names[0]).toContain("message-in");
  expect(names[1]).toBe("message-pop");
});

test("connexion refusée : le message d'erreur a la même forme (rouge, reste affiché)", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/connexion");
  await page.getByLabel("Email ou pseudo").fill("personne19@club.test");
  await page.getByLabel("Mot de passe", { exact: true }).fill("mauvais-mot-de-passe");
  await page.getByRole("button", { name: "Se connecter" }).click();
  const msg = page.getByRole("alert").filter({ hasText: "incorrect" });
  await expect(msg).toBeVisible();
  await expect(msg).toHaveAttribute("data-tone", "error");
  await page.waitForTimeout(5000);
  await expect(msg).toBeVisible();
});
