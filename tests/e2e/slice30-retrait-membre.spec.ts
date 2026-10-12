import { type Browser, type Page, expect, test } from "@playwright/test";
import { allowClubCreation, checkPage, currentClubId, joinClubById, openSection, signUp } from "./helpers";

// Retrait d'un membre par un admin, puis « Demander à revenir » (accepté ou refusé). Plus de code d'invitation.

test.describe.configure({ mode: "serial" });

const CLUB = "TC Retrait30";
let clubId: string;
let admin: Page, max: Page, lea: Page;

const newPage = async (b: Browser) => {
  const p = await (await b.newContext()).newPage();
  p.on("dialog", (d) => void d.accept());
  return p;
};

test("mise en place : l'admin crée le club, deux membres le rejoignent d'un bouton", async ({ browser }) => {
  [admin, max, lea] = await Promise.all([newPage(browser), newPage(browser), newPage(browser)]);
  await signUp(admin, "Admin30");
  await allowClubCreation();
  await admin.goto("/clubs/nouveau");
  await admin.getByLabel("Nom du club").fill(CLUB);
  await admin.getByRole("button", { name: "Créer le club" }).click();
  await expect(admin.getByRole("heading", { name: CLUB })).toBeVisible();
  clubId = await currentClubId(admin);
  await signUp(max, "Max30");
  await joinClubById(max, clubId);
  await signUp(lea, "Lea30");
  await joinClubById(lea, clubId);
});

test("un membre simple ne voit aucun bouton « Retirer du club »", async () => {
  await lea.goto(`/clubs/${clubId}`);
  await openSection(lea, "Membres");
  await expect(lea.getByRole("button", { name: /Retirer .* du club/ })).toHaveCount(0);
});

test("l'admin retire Max (avec confirmation) : il disparaît des membres, pas des autres", async () => {
  await admin.goto(`/clubs/${clubId}`);
  await openSection(admin, "Membres");
  // Pas de bouton « Retirer du club » pour l'admin lui-même.
  await expect(admin.getByRole("button", { name: "Retirer Admin30 du club" })).toHaveCount(0);
  let message = "";
  admin.removeAllListeners("dialog");
  admin.once("dialog", (d) => {
    message = d.message();
    void d.dismiss();
  });
  await admin.getByRole("button", { name: "Retirer Max30 du club" }).click();
  expect(message).toContain("Retirer Max30 du club ?");
  await expect(admin.getByText("Membres (3)")).toBeVisible(); // annulé : rien ne change
  admin.on("dialog", (d) => void d.accept());
  await admin.getByRole("button", { name: "Retirer Max30 du club" }).click();
  await expect(admin.getByText("Membres (2)")).toBeVisible();
  await expect(admin.getByRole("button", { name: "Retirer Lea30 du club" })).toBeVisible();
});

test("Max retiré : pas de « Rejoindre le club » en un clic, mais « Demander à revenir »", async () => {
  await max.goto(`/clubs/${clubId}`);
  await expect(max.getByTestId("visitor-club")).toBeVisible();
  await expect(max.getByRole("button", { name: "Rejoindre le club" })).toHaveCount(0);
  await checkPage(max, "300-retire-demander-revenir");
  await max.getByRole("button", { name: "Demander à revenir" }).click();
  await expect(max.getByTestId("return-pending")).toBeVisible();
  await max.reload();
  await expect(max.getByTestId("return-pending")).toBeVisible();
  // La page d'une rencontre ne propose pas non plus « Rejoindre » d'un clic.
  await expect(max.getByRole("button", { name: "Rejoindre le club" })).toHaveCount(0);
});

test("l'admin refuse : Max reste retiré et peut redemander", async () => {
  await admin.goto(`/clubs/${clubId}`);
  const requests = admin.getByTestId("return-requests");
  await expect(requests).toContainText("Max30");
  await checkPage(admin, "301-demandes-de-retour");
  await requests.getByRole("button", { name: "Refuser Max30" }).click();
  await expect(requests).toBeHidden();
  await max.reload();
  await expect(max.getByRole("button", { name: "Demander à revenir" })).toBeVisible();
  await max.getByRole("button", { name: "Demander à revenir" }).click();
  await expect(max.getByTestId("return-pending")).toBeVisible();
});

test("l'admin accepte : Max redevient membre simple", async () => {
  await admin.goto(`/clubs/${clubId}`);
  await admin.getByTestId("return-requests").getByRole("button", { name: "Accepter Max30" }).click();
  await expect(admin.getByTestId("return-requests")).toBeHidden();
  await max.reload();
  await expect(max.getByText("Votre rôle : membre")).toBeVisible();
  await expect(max.getByRole("button", { name: /Retirer .* du club/ })).toHaveCount(0);
});

test("quitter soi-même n'empêche pas de revenir d'un clic", async () => {
  await lea.goto(`/clubs/${clubId}`);
  await lea.getByRole("button", { name: "Quitter le club" }).click();
  await expect(lea.getByTestId("visitor-club")).toBeVisible();
  await lea.getByRole("button", { name: "Rejoindre le club" }).click();
  await expect(lea.getByText("Votre rôle : membre")).toBeVisible();
});
