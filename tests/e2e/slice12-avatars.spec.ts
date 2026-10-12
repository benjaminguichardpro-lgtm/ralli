import { type Browser, type Page, expect, test } from "@playwright/test";
import sharp from "sharp";
import { checkPage, openSection, signOut, signUp, currentClubId, joinClubById, allowClubCreation } from "./helpers";

// Ines (admin), Jules et Kim (membres), Lea (aucun club en commun), un visiteur sans compte.

test.describe.configure({ mode: "serial" });

let ines: Page, jules: Page, kim: Page, lea: Page, anon: Page;
let clubUrl: string, julesPhotoUrl: string;

const newPage = async (b: Browser) => (await b.newContext()).newPage();
const headerAvatar = (p: Page) => p.getByRole("link", { name: "Mon profil" }).getByTestId("avatar");

async function register(page: Page, name: string) {
  await signUp(page, name);
  await expect(page.getByTestId("nav-user")).toHaveText(name);
}

const photo = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: "#b4502b" } }).jpeg().toBuffer();

test.beforeAll(async ({ browser }) => {
  [ines, jules, kim, lea, anon] = await Promise.all([newPage(browser), newPage(browser), newPage(browser), newPage(browser), newPage(browser)]);
});

test("mise en place : club d'Ines, Jules et Kim membres, Lea sans club", async () => {
  await register(ines, "Ines");
  await allowClubCreation();
  await ines.goto("/clubs/nouveau");
  await ines.getByLabel("Nom du club").fill("TC Avatars");
  await ines.getByRole("button", { name: "Créer le club" }).click();
  const code = await currentClubId(ines);
  clubUrl = ines.url();
  for (const [page, name] of [[jules, "Jules"], [kim, "Kim"]] as const) {
    await register(page, name);
    await joinClubById(page, code);
    await expect(page.getByText(/Votre rôle/)).toBeVisible();
  }
  await register(lea, "Lea");
});

test("bannière aérée : 64 px, solde sur une ligne, avatar rond en haut à droite, plus de pseudo ni de Déconnexion", async () => {
  await jules.goto("/");
  const header = jules.locator("header");
  expect((await header.boundingBox())!.height).toBe(64);
  const balance = jules.getByTestId("balance");
  await expect(balance).toBeVisible();
  expect((await balance.boundingBox())!.height, "solde sur une seule ligne").toBeLessThan(28);
  await expect(jules.getByRole("button", { name: "Déconnexion" })).toHaveCount(0);
  // Aucun texte visible dans la bannière en dehors du logo et du solde.
  await expect(header).toHaveText(/^Ralli1\s000\sAcesJules$/); // le pseudo n'est là que pour les lecteurs d'écran (sr-only)
  const link = jules.getByRole("link", { name: "Mon profil" });
  const box = (await link.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.x + box.width).toBeGreaterThan(jules.viewportSize()!.width - 30); // tout à droite
  await expect(headerAvatar(jules)).toBeVisible();
  await checkPage(jules, "90-banniere");
});

test("l'avatar de la bannière mène à Mon profil ; avatar attribué à l'inscription, un seul marqué", async () => {
  await jules.getByRole("link", { name: "Mon profil" }).click();
  await expect(jules).toHaveURL(/\/profil$/);
  await expect(jules.getByRole("heading", { name: "Mon profil" })).toBeVisible();
  await expect(jules.getByTestId("profile-name")).toHaveText("Jules");
  const picker = jules.getByTestId("avatar-picker");
  await expect(picker.getByRole("button")).toHaveCount(12);
  await expect(picker.locator('button[aria-pressed="true"]')).toHaveCount(1);
  await checkPage(jules, "91-profil");
});

test("Jules choisit « Le smash » : bannière et profil suivent, y compris après rechargement", async () => {
  const picker = jules.getByTestId("avatar-picker");
  await picker.getByRole("button", { name: "Le smash" }).click();
  await expect(picker.getByText("Avatar enregistré.")).toBeVisible();
  await expect(picker.getByRole("button", { name: "Le smash" })).toHaveAttribute("aria-pressed", "true");
  await expect(headerAvatar(jules)).toHaveAttribute("src", "/avatar/smash.svg");
  await jules.reload();
  await expect(headerAvatar(jules)).toHaveAttribute("src", "/avatar/smash.svg");
});

test("Jules importe une photo : recadrée en carré, affichée partout, plus aucun avatar prédéfini marqué", async () => {
  const form = jules.getByTestId("photo-upload");
  // Le bouton « Importer une photo » est juste sous l'avatar, et ouvre le choix de fichier.
  const avatarBox = (await jules.getByTestId("profile-name").locator("xpath=..").getByTestId("avatar").boundingBox())!;
  const buttonBox = (await form.getByRole("button", { name: "Importer une photo" }).boundingBox())!;
  expect(buttonBox.y).toBeGreaterThan(avatarBox.y + avatarBox.height);
  const chooser = jules.waitForEvent("filechooser");
  await form.getByRole("button", { name: "Importer une photo" }).click();
  await (await chooser).setFiles({ name: "moi.jpg", mimeType: "image/jpeg", buffer: await photo(900, 400) });
  await expect(form.getByText("Photo enregistrée.")).toBeVisible();
  await expect(headerAvatar(jules)).toHaveAttribute("src", /^\/api\/avatar\/[\w-]+\?v=\d+$/);
  julesPhotoUrl = (await headerAvatar(jules).getAttribute("src"))!;
  // L'image se charge réellement et fait 256 px de côté.
  const size = await headerAvatar(jules).evaluate((img: HTMLImageElement) => img.decode().then(() => [img.naturalWidth, img.naturalHeight]));
  expect(size).toEqual([256, 256]);
  await expect(jules.getByTestId("avatar-picker").locator('button[aria-pressed="true"]')).toHaveCount(0);
  await checkPage(jules, "92-profil-photo");
});

test("fichiers refusés : trop lourd, pas une image", async () => {
  const form = jules.getByTestId("photo-upload");
  const input = form.getByTestId("photo-input");
  await input.setInputFiles({ name: "lourde.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(5.5 * 1024 * 1024) });
  await expect(form.getByText("Photo trop lourde (5 Mo au maximum).")).toBeVisible();
  await input.setInputFiles({ name: "faux.png", mimeType: "image/png", buffer: Buffer.from("ceci n'est pas une image") });
  await expect(form.getByText(/illisible|Format non pris en charge/)).toBeVisible();
  // La photo précédente est intacte.
  await expect(headerAvatar(jules)).toHaveAttribute("src", julesPhotoUrl);
});

test("la photo n'est visible que du club : Kim oui, Lea (autre club) non, visiteur non", async () => {
  expect((await kim.request.get(julesPhotoUrl)).status()).toBe(200);
  expect((await kim.request.get(julesPhotoUrl)).headers()["content-type"]).toBe("image/webp");
  expect((await lea.request.get(julesPhotoUrl)).status()).toBe(404);
  expect((await anon.request.get(julesPhotoUrl)).status()).toBe(401);
  // Aucun accès non plus à un chemin détourné.
  expect((await kim.request.get("/api/avatar/..%2F..%2Fpackage.json")).status()).toBeGreaterThanOrEqual(400);
});

test("page du club : les membres ont leur avatar ; seul l'admin voit « Retirer la photo », et pas pour lui-même", async () => {
  await kim.goto(clubUrl);
  await expect(kim.getByText("Membres (3)")).toBeVisible();
  await openSection(kim, "Membres");
  await expect(kim.getByTestId("section-members").getByTestId("avatar")).toHaveCount(3);
  await expect(kim.getByRole("button", { name: "Retirer la photo" })).toHaveCount(0);

  await ines.goto(clubUrl);
  await openSection(ines, "Membres");
  await expect(ines.getByRole("button", { name: "Retirer la photo" })).toHaveCount(1); // seulement Jules a une photo
  await checkPage(ines, "93-club-membres-avatars");
});

test("Ines retire la photo de Jules (avec confirmation) : avatar prédéfini, photo inaccessible", async () => {
  ines.once("dialog", (d) => void d.accept());
  await ines.getByRole("button", { name: "Retirer la photo" }).click();
  await expect(ines.getByRole("button", { name: "Retirer la photo" })).toHaveCount(0);
  // Le bouton passe à « … » pendant l'envoi : on attend le résultat, pas la disparition du libellé.
  await expect.poll(async () => (await kim.request.get(julesPhotoUrl)).status()).toBe(404);
  await jules.goto("/");
  await expect(headerAvatar(jules)).toHaveAttribute("src", /^\/avatar\/[a-z-]+\.svg$/);
});

test("déconnexion depuis Mon profil", async () => {
  await jules.goto("/");
  await signOut(jules);
  await expect(jules.getByRole("link", { name: "Se connecter" })).toBeVisible();
  await expect(jules.getByRole("link", { name: "Mon profil" })).toHaveCount(0);
});
