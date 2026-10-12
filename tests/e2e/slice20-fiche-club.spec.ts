import { type Browser, type Page, expect, test } from "@playwright/test";
import sharp from "sharp";
import { awaitServerAction, checkPage, currentClubId, joinClubById, signUp, allowClubCreation } from "./helpers";

// Odile (admin), Hugo et Nina (membres), Oscar (aucun club en commun), un visiteur sans compte.

test.describe.configure({ mode: "serial" });

let odile: Page, hugo: Page, nina: Page, oscar: Page, anon: Page;
let clubUrl: string, ficheUrl: string, logoUrl: string;

const newPage = async (b: Browser) => (await b.newContext()).newPage();
const logo = () => sharp({ create: { width: 1000, height: 400, channels: 4, background: "#b4502b" } }).png().toBuffer();
const NOT_SPECIFIED = "Non précisé";

/** Admin : ouvre le bloc de modification (il est refermé à chaque chargement de la page). */
async function openEditor(page: Page) {
  await page.waitForLoadState("networkidle"); // page prête (hydratée) avant de cliquer
  await page.getByRole("button", { name: "Modifier la fiche" }).click();
  await expect(page.getByTestId("profile-edit")).toBeVisible();
}

async function register(page: Page, name: string) {
  await signUp(page, name);
  await expect(page.getByTestId("nav-user")).toHaveText(name);
}

test.beforeAll(async ({ browser }) => {
  [odile, hugo, nina, oscar, anon] = await Promise.all([newPage(browser), newPage(browser), newPage(browser), newPage(browser), newPage(browser)]);
});

test("mise en place : club d'Odile, Hugo et Nina membres, Oscar sans club", async () => {
  await register(odile, "Odile20");
  await allowClubCreation();
  await odile.goto("/clubs/nouveau");
  await odile.getByLabel("Nom du club").fill("TC Fiche20");
  await odile.getByRole("button", { name: "Créer le club" }).click();
  const code = await currentClubId(odile);
  clubUrl = odile.url();
  ficheUrl = `${clubUrl}/fiche`;
  for (const [page, name] of [[hugo, "Hugo20"], [nina, "Nina20"]] as const) {
    await register(page, name);
    await joinClubById(page, code);
    await expect(page.getByText(/Votre rôle/)).toBeVisible();
  }
  await register(oscar, "Oscar20");
});

test("fiche vide : le membre ne voit aucun lien, l'admin est invité à la compléter ; pastille avec les initiales", async () => {
  await hugo.goto(clubUrl);
  const header = hugo.getByTestId("club-header");
  await expect(header.getByRole("heading", { name: "TC Fiche20" })).toBeVisible();
  await expect(header.getByTestId("club-logo-initials")).toHaveText("TC");
  await expect(header.getByRole("link", { name: /fiche du club/ })).toHaveCount(0);
  await expect(hugo.getByTestId("club-summary")).toHaveCount(0);

  await odile.goto(clubUrl);
  await odile.getByRole("link", { name: "Compléter la fiche du club" }).click();
  await expect(odile).toHaveURL(ficheUrl);
  await expect(odile.getByTestId("profile-empty-admin")).toBeVisible();
  // Chaque case non renseignée affiche « Non précisé » : fondation, licenciés, adresse, site, courts x2, présentation.
  await expect(odile.getByText(NOT_SPECIFIED, { exact: true })).toHaveCount(7);
  await checkPage(odile, "100-fiche-vide");
});

test("Odile remplit la fiche : « Confirmer ces changements ? » ; si elle refuse, rien n'est enregistré", async () => {
  // Le bloc de modification n'existe pas avant le clic sur « Modifier la fiche ».
  await expect(odile.getByTestId("club-profile-form")).toHaveCount(0);
  await expect(odile.getByTestId("profile-edit")).toHaveCount(0);
  await expect(odile.getByTestId("club-logo-upload")).toHaveCount(0);
  await openEditor(odile);
  await expect(odile.getByRole("button", { name: "Modifier la fiche" })).toHaveCount(0); // remplacé par le bloc ouvert
  await odile.getByRole("button", { name: "Fermer" }).click();
  await expect(odile.getByTestId("profile-edit")).toHaveCount(0); // « Fermer » replie le bloc
  await openEditor(odile);
  const form = odile.getByTestId("club-profile-form");
  await form.getByLabel("Année de fondation").fill("1974");
  await form.getByLabel("Nombre de licenciés").fill("1250");
  await form.getByLabel("Adresse").fill("12 rue des Lilas");
  await form.getByLabel("Code postal").fill("69003");
  await form.getByLabel("Ville").fill("Lyon");
  await form.getByLabel("Site web du club").fill("https://www.tclyon-test.fr/");
  await form.getByLabel("Courts intérieurs").fill("2");
  await form.getByLabel("Courts extérieurs").fill("6");
  await form.getByLabel("Description").fill("Un club convivial\nau cœur de Lyon.");

  let asked = "";
  odile.once("dialog", (d) => {
    asked = d.message();
    void d.dismiss();
  });
  await form.getByRole("button", { name: "Enregistrer la fiche" }).click();
  expect(asked).toBe("Confirmer ces changements ?");
  await odile.reload();
  await expect(odile.getByTestId("profile-founded")).toContainText(NOT_SPECIFIED); // refusé : rien n'a changé
  await expect(odile.getByTestId("profile-edit")).toHaveCount(0); // le bloc est refermé après rechargement

  await openEditor(odile);
  await form.getByLabel("Année de fondation").fill("1974");
  await form.getByLabel("Nombre de licenciés").fill("1250");
  await form.getByLabel("Adresse").fill("12 rue des Lilas");
  await form.getByLabel("Code postal").fill("69003");
  await form.getByLabel("Ville").fill("Lyon");
  await form.getByLabel("Site web du club").fill("https://www.tclyon-test.fr/");
  await form.getByLabel("Courts intérieurs").fill("2");
  await form.getByLabel("Courts extérieurs").fill("6");
  await form.getByLabel("Description").fill("Un club convivial\nau cœur de Lyon.");
  odile.once("dialog", (d) => void d.accept());
  await form.getByRole("button", { name: "Enregistrer la fiche" }).click();
  await expect(form.getByText("Fiche du club enregistrée.")).toBeVisible();

  await expect(odile.getByTestId("profile-founded")).toContainText("1974");
  await expect(odile.getByTestId("profile-licensees")).toContainText(/1\s250/);
  await expect(odile.getByTestId("profile-address")).toContainText("12 rue des Lilas, 69003 Lyon");
  await expect(odile.getByTestId("profile-indoor")).toContainText("2");
  await expect(odile.getByTestId("profile-outdoor")).toContainText("6");
  await expect(odile.getByTestId("profile-description")).toContainText("Un club convivial");
  await expect(odile.getByText(NOT_SPECIFIED, { exact: true })).toHaveCount(0);
  await expect(odile.getByTestId("profile-empty-admin")).toHaveCount(0);
  // Le lien du site s'ouvre dans un nouvel onglet, sans rien transmettre.
  const link = odile.getByTestId("profile-website").getByRole("link");
  await expect(link).toHaveText("tclyon-test.fr");
  await expect(link).toHaveAttribute("href", "https://www.tclyon-test.fr/");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await checkPage(odile, "101-fiche-remplie");
});

test("valeurs refusées avec un message clair, et la fiche reste intacte", async () => {
  const form = odile.getByTestId("club-profile-form");
  odile.on("dialog", (d) => void d.accept());
  await form.getByLabel("Site web du club").fill("www.monclub.fr");
  await awaitServerAction(odile, () => form.getByRole("button", { name: "Enregistrer la fiche" }).click());
  await expect(form.getByText(/doit commencer par https:\/\/ ou http:\/\//)).toBeVisible();
  await form.getByLabel("Site web du club").fill("javascript:alert(1)");
  await awaitServerAction(odile, () => form.getByRole("button", { name: "Enregistrer la fiche" }).click());
  await expect(form.getByText(/doit commencer par https:\/\/ ou http:\/\//)).toBeVisible();
  await form.getByLabel("Site web du club").fill("https://www.tclyon-test.fr/");
  await form.getByLabel("Année de fondation").fill("1700");
  await form.getByLabel("Courts extérieurs").fill("-4");
  await awaitServerAction(odile, () => form.getByRole("button", { name: "Enregistrer la fiche" }).click());
  await expect(form.getByText(/Année de fondation : entre 1800 et/)).toBeVisible();
  await expect(form.getByText(/Courts extérieurs/).last()).toBeVisible();
  await odile.reload();
  await expect(odile.getByTestId("profile-founded")).toContainText("1974");
  await expect(odile.getByTestId("profile-outdoor")).toContainText("6");
  odile.removeAllListeners("dialog");
});

test("Odile importe un logo : non recadré, affiché sur la page du club et dans « Mes clubs »", async () => {
  await openEditor(odile);
  const upload = odile.getByTestId("club-logo-upload");
  const chooser = odile.waitForEvent("filechooser");
  await upload.getByRole("button", { name: "Importer un logo" }).click();
  await (await chooser).setFiles({ name: "logo.png", mimeType: "image/png", buffer: await logo() });
  await expect(upload.getByText("Logo enregistré.")).toBeVisible();
  const img = odile.getByTestId("club-logo").first();
  await expect(img).toHaveAttribute("src", /^\/api\/club-logo\/[\w-]+\?v=\d+$/);
  logoUrl = (await img.getAttribute("src"))!;
  // L'image se charge réellement ; ramenée à 512 px de large, son format 1000×400 est conservé (205 px de haut).
  const size = await img.evaluate((i: HTMLImageElement) => i.decode().then(() => [i.naturalWidth, i.naturalHeight]));
  expect(size).toEqual([512, 205]);

  await odile.goto(clubUrl);
  await expect(odile.getByTestId("club-header").getByTestId("club-logo")).toBeVisible();
  await expect(odile.getByTestId("club-header").getByTestId("club-logo-initials")).toHaveCount(0);
  await odile.goto("/clubs");
  await expect(odile.getByTestId("my-clubs").getByTestId("club-logo")).toBeVisible();
  await checkPage(odile, "102-mes-clubs-logo");
});

test("fichiers refusés : trop lourd, pas une image ; le logo en place reste intact", async () => {
  await odile.goto(ficheUrl);
  await openEditor(odile);
  const upload = odile.getByTestId("club-logo-upload");
  const input = upload.getByTestId("club-logo-input");
  await input.setInputFiles({ name: "lourd.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(5.5 * 1024 * 1024) });
  await expect(upload.getByText("Image trop lourde (5 Mo au maximum).")).toBeVisible();
  await input.setInputFiles({ name: "faux.png", mimeType: "image/png", buffer: Buffer.from("ceci n'est pas une image") });
  await expect(upload.getByText(/illisible|Format non pris en charge/)).toBeVisible();
  await expect(odile.getByTestId("club-logo").first()).toHaveAttribute("src", logoUrl);
});

test("le logo est visible de tout compte connecté (les clubs sont publics), pas du visiteur sans compte", async () => {
  expect((await hugo.request.get(logoUrl)).status()).toBe(200);
  expect((await hugo.request.get(logoUrl)).headers()["content-type"]).toBe("image/webp");
  expect((await oscar.request.get(logoUrl)).status()).toBe(200);
  expect((await anon.request.get(logoUrl)).status()).toBe(401);
  expect((await hugo.request.get("/api/club-logo/..%2F..%2Fpackage.json")).status()).toBeGreaterThanOrEqual(400);
});

test("le membre voit un résumé et la fiche en lecture seule, sans aucun moyen de la modifier", async () => {
  await hugo.goto(clubUrl);
  const summary = hugo.getByTestId("club-summary");
  await expect(summary).toContainText("Lyon");
  await expect(summary).toContainText(/1\s250 licenciés/);
  await expect(summary.getByRole("link", { name: "tclyon-test.fr" })).toHaveAttribute("target", "_blank");
  await hugo.getByRole("link", { name: "Voir la fiche du club" }).click();
  await expect(hugo).toHaveURL(ficheUrl);
  await expect(hugo.getByTestId("profile-address")).toContainText("12 rue des Lilas, 69003 Lyon");
  await expect(hugo.getByTestId("profile-edit")).toHaveCount(0);
  await expect(hugo.getByRole("button", { name: "Modifier la fiche" })).toHaveCount(0);
  await expect(hugo.getByRole("button", { name: "Enregistrer la fiche" })).toHaveCount(0);
  await expect(hugo.getByRole("button", { name: /logo/ })).toHaveCount(0);
  await checkPage(hugo, "103-fiche-membre");
});

test("un non-membre consulte la fiche sans pouvoir la modifier ; le visiteur sans compte doit se connecter", async () => {
  await oscar.goto(ficheUrl);
  await expect(oscar.getByText("12 rue des Lilas")).toBeVisible();
  await expect(oscar.getByRole("button", { name: "Enregistrer la fiche" })).toHaveCount(0);
  await expect(oscar.getByRole("button", { name: /logo/ })).toHaveCount(0);
  await anon.goto(ficheUrl);
  await expect(anon).toHaveURL(/\/connexion/);
});

test("vider un champ l'efface ; retirer le logo ramène la pastille (avec confirmation)", async () => {
  await odile.goto(ficheUrl);
  await openEditor(odile);
  const form = odile.getByTestId("club-profile-form");
  await form.getByLabel("Site web du club").fill("");
  await form.getByLabel("Nombre de licenciés").fill("");
  odile.once("dialog", (d) => void d.accept());
  await form.getByRole("button", { name: "Enregistrer la fiche" }).click();
  await expect(form.getByText("Fiche du club enregistrée.")).toBeVisible();
  await expect(odile.getByTestId("profile-website")).toContainText(NOT_SPECIFIED);
  await expect(odile.getByTestId("profile-licensees")).toContainText(NOT_SPECIFIED);

  let asked = "";
  odile.once("dialog", (d) => {
    asked = d.message();
    void d.accept();
  });
  await odile.getByRole("button", { name: "Retirer le logo" }).click();
  await expect(odile.getByTestId("club-logo-initials").first()).toHaveText("TC");
  expect(asked).toBe("Retirer le logo du club ?");
  expect((await hugo.request.get(logoUrl)).status()).toBe(404);
});

test("l'admin renomme le club depuis la fiche", async () => {
  await odile.goto(ficheUrl);
  await openEditor(odile);
  const form = odile.getByTestId("club-profile-form");
  await form.getByLabel("Nom du club").fill("TC Fiche20 Lyon");
  odile.once("dialog", (d) => void d.accept());
  await form.getByRole("button", { name: "Enregistrer la fiche" }).click();
  await expect(form.getByText("Fiche du club enregistrée.")).toBeVisible();
  await nina.goto(clubUrl);
  await expect(nina.getByRole("heading", { name: "TC Fiche20 Lyon" })).toBeVisible();
});
