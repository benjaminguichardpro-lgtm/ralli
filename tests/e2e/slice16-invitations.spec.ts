import { type Browser, type Page, expect, test } from "@playwright/test";
import { checkPage, signIn, signUp, skipGuide, allowClubCreation } from "./helpers";

// Lien d'invitation (/rejoindre/CODE), parcours inscription / connexion puis confirmation, écrans vides selon le rôle.

test.describe.configure({ mode: "serial" });

const CLUB = "TC Invitation16";
let code: string, clubId: string;
let capitaine: Page;

// Next 16 garde l'écran précédent dans le DOM, masqué : on ne cible que le titre visible.
const visibleClub = (p: Page) => p.locator('[data-testid="invitation-club"]:visible');
const newPage = async (b: Browser) => (await b.newContext()).newPage();

test("l'admin révèle le code et trouve le bouton « Inviter par WhatsApp »", async ({ browser }) => {
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
  await expect(capitaine.getByRole("link", { name: "Inviter par WhatsApp" })).toHaveCount(0);
  await capitaine.getByRole("button", { name: "Révéler le code d'invitation" }).click();
  code = (await capitaine.getByTestId("invite-code").innerText()).trim();
  expect(code).toMatch(/^[A-Z2-9]{6}$/);
  const share = capitaine.getByRole("link", { name: "Inviter par WhatsApp" });
  const href = decodeURIComponent((await share.getAttribute("href"))!);
  expect(href).toContain("https://wa.me/?text=");
  expect(href).toContain(CLUB);
  expect(href).toContain(`/rejoindre/${code}`);
  await checkPage(capitaine, "160-invitation-admin");
});

test("sans compte : le lien mène à l'inscription, puis à la confirmation, puis au club", async ({ browser }) => {
  const page = await newPage(browser);
  await page.goto(`/rejoindre/${code.toLowerCase()}`);
  await expect(visibleClub(page)).toHaveText(CLUB);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await checkPage(page, "161-invitation-visiteur");
  await page.getByRole("link", { name: "Créer un compte" }).click();
  await expect(page).toHaveURL(new RegExp(`/inscription\\?invitation=${code}`));
  await page.getByLabel("Email").fill("nouveau16@club.test");
  await page.getByLabel("Pseudo").fill("Nouveau16");
  await page.getByLabel("Mot de passe", { exact: true }).fill("motdepasse");
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await skipGuide(page);
  // Confirmation demandée : on n'entre pas dans un club en touchant un lien.
  await expect(visibleClub(page)).toHaveText(`Rejoindre ${CLUB} ?`);
  await expect(page).toHaveURL(new RegExp(`/rejoindre/${code}$`));
  await checkPage(page, "162-invitation-confirmation");
  await page.getByRole("button", { name: `Rejoindre ${CLUB}` }).click();
  await expect(page).toHaveURL(new RegExp(`/clubs/${clubId}$`));
  await expect(page.getByRole("heading", { name: CLUB })).toBeVisible();
  // Membre simple : jamais le code ni le bouton d'invitation.
  await expect(page.getByRole("button", { name: "Révéler le code d'invitation" })).toHaveCount(0);
  await expect(page.getByTestId("empty-member").or(page.getByText("Ton capitaine publiera bientôt la prochaine rencontre."))).toBeVisible();
  await page.close();
});

test("avec un compte existant : « J'ai déjà un compte », connexion, « Non merci » laisse hors du club", async ({ browser }) => {
  const other = await newPage(browser);
  await signUp(other, "Joueur16");
  await other.context().clearCookies();
  const page = await newPage(browser);
  await page.goto(`/rejoindre/${code}`);
  await page.getByRole("link", { name: "J'ai déjà un compte" }).click();
  await expect(page).toHaveURL(new RegExp(`/connexion\\?invitation=${code}`));
  await page.getByLabel("Email ou pseudo").fill("joueur16@club.test");
  await page.getByLabel("Mot de passe", { exact: true }).fill("motdepasse");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(visibleClub(page)).toHaveText(`Rejoindre ${CLUB} ?`);
  await page.getByRole("link", { name: "Non merci" }).click();
  await expect(page.getByRole("heading", { name: "Rejoignez votre club" })).toBeVisible();
  // Déjà membre : le lien ne propose plus de rejoindre.
  await capitaine.goto(`/rejoindre/${code}`);
  await expect(capitaine.getByRole("heading", { name: `Tu es déjà membre de ${CLUB}` })).toBeVisible();
  await page.close();
});

test("lien invalide ou code périmé : message clair, jamais le nom d'un club", async ({ browser }) => {
  const page = await newPage(browser);
  await page.goto("/rejoindre/ZZZZZZ");
  await expect(page.getByTestId("invitation-invalide")).toBeVisible();
  await page.goto("/rejoindre/AB0123");
  await expect(page.getByTestId("invitation-invalide")).toBeVisible();
  await checkPage(page, "163-invitation-invalide");
  await page.close();
});

test("une adresse de retour truquée ne redirige jamais hors de Ralli", async ({ browser }) => {
  const page = await newPage(browser);
  await page.goto("/connexion?invitation=https://evil.example");
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
  // Le lien général d'inscription ne contient jamais le code du club.
  expect(href).not.toContain(code);
  await checkPage(membre, "165-vide-membre");
  await membre.close();
});
