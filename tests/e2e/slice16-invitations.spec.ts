import { type Browser, type Page, expect, test } from "@playwright/test";
import { checkPage, signIn, signUp, skipGuide, allowClubCreation } from "./helpers";

// Lien d'invitation = adresse de la page du club (/clubs/<id>) : parcours inscription / connexion puis « Rejoindre le club », écrans vides selon le rôle.

test.describe.configure({ mode: "serial" });

const CLUB = "TC Invitation16";
let clubId: string;
let capitaine: Page;

const newPage = async (b: Browser) => (await b.newContext()).newPage();

test("l'admin trouve le bouton « Inviter par WhatsApp », qui partage le lien de la page du club", async ({ browser }) => {
  capitaine = await newPage(browser);
  await signUp(capitaine, "Capi16");
  await expect(capitaine.getByTestId("nav-user")).toHaveText("Capi16");
  // Club vide pour un admin : l'accueil propose de créer la première rencontre une fois le club créé.
  await allowClubCreation();
  await capitaine.goto("/clubs/nouveau");
  await capitaine.getByLabel("Nom du club").fill(CLUB);
  await capitaine.getByRole("button", { name: "Créer le club" }).click();
  await expect(capitaine.getByRole("heading", { name: CLUB })).toBeVisible();
  clubId = capitaine.url().split("/").pop()!;
  await expect(capitaine.getByText("Code d'invitation")).toHaveCount(0);
  const share = capitaine.getByRole("link", { name: "Inviter par WhatsApp" });
  const href = decodeURIComponent((await share.getAttribute("href"))!);
  expect(href).toContain("https://wa.me/?text=");
  expect(href).toContain(CLUB);
  expect(href).toContain(`/clubs/${clubId}`);
  await checkPage(capitaine, "160-invitation-admin");
});

test("sans compte : le lien mène à la connexion puis à l'inscription, puis au club, où l'on rejoint d'un bouton", async ({ browser }) => {
  const page = await newPage(browser);
  await page.goto(`/clubs/${clubId}`);
  await expect(page).toHaveURL(new RegExp(`/connexion\\?club=${clubId}$`));
  await checkPage(page, "161-invitation-visiteur");
  await page.getByRole("link", { name: "S'inscrire" }).click();
  await expect(page).toHaveURL(new RegExp(`/inscription\\?club=${clubId}`));
  // Next garde l'écran précédent (la connexion) dans le DOM, masqué : on cible les champs du formulaire d'inscription par leur nom.
  const form = page.locator("form").filter({ has: page.locator('input[name="displayName"]') });
  await form.locator('input[name="email"]').fill("nouveau16@club.test");
  await form.locator('input[name="displayName"]').fill("Nouveau16");
  await form.locator('input[name="password"]').fill("motdepasse");
  await form.getByRole("button", { name: "Créer mon compte" }).click();
  await skipGuide(page);
  // On arrive sur la page du club, sans y être entré : il faut appuyer sur « Rejoindre le club ».
  await expect(page).toHaveURL(new RegExp(`/clubs/${clubId}$`));
  await expect(page.getByTestId("visitor-club")).toBeVisible();
  await checkPage(page, "162-invitation-confirmation");
  await page.getByRole("button", { name: "Rejoindre le club" }).click();
  await expect(page.getByText("Votre rôle : membre")).toBeVisible();
  await expect(page.getByRole("heading", { name: CLUB })).toBeVisible();
  await expect(page.getByRole("button", { name: /Nommer admin|Retirer du club/ })).toHaveCount(0);
  await expect(page.getByTestId("empty-member").or(page.getByText("Ton capitaine publiera bientôt la prochaine rencontre."))).toBeVisible();
  await page.close();
});

test("avec un compte existant : connexion depuis le lien, on arrive sur le club sans y entrer", async ({ browser }) => {
  const other = await newPage(browser);
  await signUp(other, "Joueur16");
  await other.context().clearCookies();
  const page = await newPage(browser);
  await page.goto(`/clubs/${clubId}`);
  await expect(page).toHaveURL(new RegExp(`/connexion\\?club=${clubId}$`));
  await page.getByLabel("Email ou pseudo").fill("joueur16@club.test");
  await page.getByLabel("Mot de passe", { exact: true }).fill("motdepasse");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByTestId("visitor-club")).toBeVisible();
  await expect(page.getByRole("button", { name: "Rejoindre le club" })).toBeVisible();
  // Déjà membre : le lien ouvre simplement le club.
  await capitaine.goto(`/clubs/${clubId}`);
  await expect(capitaine.getByText("Votre rôle : admin")).toBeVisible();
  await page.close();
});

test("ancien lien /rejoindre/CODE : redirigé vers la recherche de clubs, sans erreur", async () => {
  await capitaine.goto("/rejoindre/ZZZZZZ");
  await expect(capitaine).toHaveURL(/\/clubs\/recherche$/);
  await capitaine.goto("/clubs/rejoindre");
  await expect(capitaine).toHaveURL(/\/clubs\/recherche$/);
  await checkPage(capitaine, "163-ancien-lien");
});

test("une adresse de retour truquée ne redirige jamais hors de Ralli", async ({ browser }) => {
  const page = await newPage(browser);
  await page.goto("/connexion?club=https://evil.example");
  await page.getByLabel("Email ou pseudo").fill("joueur16@club.test");
  await page.getByLabel("Mot de passe", { exact: true }).fill("motdepasse");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByTestId("nav-user")).toHaveText("Joueur16");
  expect(new URL(page.url()).pathname).toBe("/");
  await page.close();
});

test("écrans vides de l'accueil : l'admin crée une rencontre, le membre invite des coéquipiers", async ({ browser }) => {
  await capitaine.goto("/");
  const create = capitaine.getByRole("link", { name: "Créer une rencontre" });
  await expect(create).toHaveAttribute("href", `/clubs/${clubId}/rencontres/nouvelle`);
  await checkPage(capitaine, "164-vide-admin");

  const membre = await newPage(browser);
  await signIn(membre, "Nouveau16");
  await expect(membre.getByTestId("empty-member")).toHaveText(/Ton capitaine publiera bientôt la prochaine rencontre/);
  const share = membre.getByRole("link", { name: "Inviter des coéquipiers" });
  const href = decodeURIComponent((await share.getAttribute("href"))!);
  expect(href).toContain("/inscription");
  // Le lien général d'inscription ne mène pas à un club précis.
  expect(href).not.toContain(clubId);
  await checkPage(membre, "165-vide-membre");
  await membre.close();
});
