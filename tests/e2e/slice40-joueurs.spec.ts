import { type Browser, type Page, expect, test } from "@playwright/test";
import { buildXlsx } from "../xlsx";
import { checkPage, queryTestDb, seedDemoOnTestDb, signIn, wipeTestDb } from "./helpers";

// « Joueurs du club » : ajout à la main, import en lot (CSV et Excel) avec aperçu, réservé aux admins. Charge la vraie démo :
// admin_lyon administre TC Démo-Lyon (joueurs Messieurs 1 et Dames 1), parieur1 en est simple membre.

test.describe.configure({ mode: "serial" });

const PASSWORD = "Demo-ralli-2026!";
let lyonId: string;
let before: number;

async function login(b: Browser, pseudo: string): Promise<Page> {
  const p = await (await b.newContext()).newPage();
  p.on("dialog", (d) => void d.accept());
  await signIn(p, pseudo, PASSWORD, pseudo);
  await expect(p.getByTestId("nav-user")).toHaveText(pseudo);
  const recap = p.getByTestId("results-recap");
  const popup = p.getByTestId("daily-bonus");
  for (let i = 0; i < 3; i++) {
    const which = await Promise.race([recap.waitFor({ timeout: 8000 }).then(() => "recap" as const), popup.waitFor({ timeout: 8000 }).then(() => "bonus" as const)]).catch(() => null);
    if (which === "recap") await p.keyboard.press("Escape");
    else if (which === "bonus") await popup.getByRole("button", { name: "Super" }).click();
    else break;
    await expect(which === "recap" ? recap : popup).toBeHidden();
  }
  return p;
}

const countPlayers = async () => Number((await queryTestDb<{ n: string }>(`SELECT count(*) AS n FROM "Player" WHERE "clubId" = '${lyonId}'`))[0]!.n);

test.beforeAll(async () => {
  test.setTimeout(300_000);
  await wipeTestDb();
  seedDemoOnTestDb();
  lyonId = (await queryTestDb<{ id: string }>(`SELECT id FROM "Club" WHERE name = 'TC Démo-Lyon'`))[0]!.id;
  before = await countPlayers();
});
test.afterAll(wipeTestDb);

test("un membre n'a ni lien ni accès à « Joueurs du club »", async ({ browser }) => {
  const p = await login(browser, "parieur1");
  await p.goto(`/clubs/${lyonId}`);
  await expect(p.getByTestId("club-header")).toBeVisible();
  await expect(p.getByRole("link", { name: "Joueurs du club" })).toHaveCount(0);
  await p.goto(`/clubs/${lyonId}/joueurs`);
  await expect(p.getByRole("heading", { name: "Page introuvable" })).toBeVisible();
  await p.context().close();
});

test("l'admin ajoute un joueur à la main (classement NC, date de naissance), le modifie et le place dans une équipe", async ({ browser }) => {
  test.setTimeout(240_000);
  const p = await login(browser, "admin_lyon");
  await p.goto(`/clubs/${lyonId}`);
  await p.getByRole("link", { name: "Joueurs du club" }).click();
  await expect(p).toHaveURL(new RegExp(`/clubs/${lyonId}/joueurs$`));
  await expect(p.getByTestId("club-player").first()).toBeVisible();
  const total = await p.getByTestId("club-player").count();
  expect(total).toBeGreaterThan(5);
  await checkPage(p, "joueurs-du-club");

  // Recherche : sans accents ni casse, par nom, classement ou équipe ; aucun résultat ; effacer.
  await p.waitForLoadState("networkidle");
  const search = p.getByTestId("player-search");
  await search.getByRole("searchbox", { name: "Rechercher un joueur" }).fill("LEFEVRE");
  await expect(p).toHaveURL(/joueurs\?q=LEFEVRE$/);
  await expect(search.getByRole("button")).toHaveCount(0); // plus de bouton « Chercher » : la liste se filtre en tapant
  await expect(p.getByTestId("club-player")).toHaveCount(1);
  await expect(p.getByTestId("club-player")).toContainText("Hugo Lefèvre");
  await expect(p.getByTestId("players-count")).toHaveText(`(1 sur ${total})`);
  await search.getByRole("searchbox", { name: "Rechercher un joueur" }).fill("zzzz");
  await expect(p.getByTestId("player-search-empty")).toContainText("zzzz");
  await expect(p.getByTestId("club-player")).toHaveCount(0);
  await p.getByTestId("player-search-clear").click();
  await expect(p.getByTestId("club-player")).toHaveCount(total);
  await checkPage(p, "joueurs-recherche");

  await p.getByTestId("add-player-section").locator("summary").click();
  const form = p.getByTestId("add-club-player");
  await form.getByLabel("Prénom").fill("Sacha");
  await form.getByLabel("Nom", { exact: true }).fill("Nouveau");
  await form.getByLabel("Classement").selectOption({ label: "NC" });
  await form.getByLabel("Date de naissance (facultative)").fill("1990-05-20");
  await form.getByRole("button", { name: "Ajouter le joueur" }).click();
  const row = p.getByTestId("club-player").filter({ hasText: "Sacha Nouveau" });
  await expect(row).toBeVisible();
  await expect(row).toContainText("sans équipe");
  await expect(row).toContainText(" ans"); // âge calculé
  expect((await queryTestDb<{ birthDate: Date; fftRank: string }>(`SELECT "birthDate", "fftRank" FROM "Player" WHERE "lastName" = 'Nouveau'`))[0]).toMatchObject({ fftRank: "NC" });

  // Modifier le classement et le placer dans l'équipe Messieurs 1.
  await row.locator("summary").click();
  const edit = row.getByTestId("edit-club-player");
  await edit.getByLabel("Classement").selectOption({ label: "30/2" });
  await edit.getByRole("button", { name: "Enregistrer" }).click();
  await expect(row.getByTestId("player-rank")).toHaveText("30/2");
  await row.getByTestId("add-to-team").getByLabel("Ajouter à une équipe").selectOption({ label: "Messieurs 1" });
  await row.getByRole("button", { name: "Ajouter à l'équipe" }).click();
  await expect(row).toContainText("Messieurs 1");
  // Fiche jamais alignée : supprimable.
  await row.getByRole("button", { name: "Supprimer la fiche" }).click();
  await expect(row).toHaveCount(0);
  await p.context().close();
});

test("import d'un fichier CSV : aperçu (nouveau, mise à jour, identique, doublon, erreur) puis import ; le modèle se télécharge", async ({ browser }) => {
  test.setTimeout(300_000);
  const p = await login(browser, "admin_lyon");
  await p.goto(`/clubs/${lyonId}/joueurs`);
  await p.waitForLoadState("networkidle"); // la page doit être chargée avant de choisir le fichier
  // Modèle : un CSV avec les bonnes colonnes.
  const model = await p.request.get("/api/modele-joueurs");
  expect(model.headers()["content-type"]).toContain("text/csv");
  expect(await model.text()).toContain("Nom;Prénom;Date de naissance;Classement");
  // Le modèle Excel (colonnes en format Texte) se télécharge aussi.
  const xlsxModel = await p.request.get("/api/modele-joueurs/xlsx");
  expect(xlsxModel.headers()["content-type"]).toContain("spreadsheetml.sheet");
  expect((await xlsxModel.body()).subarray(0, 2).toString()).toBe("PK"); // un classeur est un zip
  await expect(p.getByTestId("rank-hint")).toContainText("format « Texte »");

  const [existing] = await queryTestDb<{ firstName: string; lastName: string }>(`SELECT p."firstName", p."lastName" FROM "Player" p JOIN "TeamPlayer" tp ON tp."playerId" = p.id JOIN "Team" t ON t.id = tp."teamId" WHERE p."clubId" = '${lyonId}' AND t.kind = 'CLUB' ORDER BY p."lastName" LIMIT 1`);
  const csv = [
    "Nom;Prénom;Date de naissance;Classement",
    `${existing!.lastName};${existing!.firstName};;1re série`, // joueur existant : classement mis à jour
    "Nouvelle;Alice;12/04/1992;30/3",
    "Nouvelle;Alice;12/04/1992;30/3", // doublon dans le fichier
    "Bernardin;Bruno;01/01/1980;15/2",
    "Sansclassement;Carla;;", // classement absent : NC
    "Inconnue;Dora;;42/99", // erreur
  ].join("\r\n");
  await p.getByTestId("import-file").setInputFiles({ name: "joueurs.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf-8") });
  await p.getByTestId("import-preview").click();
  await expect(p.getByTestId("import-summary")).toContainText("3 nouveaux");
  await expect(p.getByTestId("import-summary")).toContainText("1 mise à jour");
  await expect(p.getByTestId("import-summary")).toContainText("1 doublon");
  await expect(p.getByTestId("import-summary")).toContainText("1 erreur");
  await expect(p.locator('[data-testid="import-row"][data-action="error"]')).toContainText("Classement inconnu");
  await expect(p.locator('[data-testid="import-row"][data-action="update"]')).toContainText("→ 1re série");
  expect(await countPlayers()).toBe(before); // l'aperçu n'a rien enregistré
  await checkPage(p, "joueurs-import-apercu");
  await p.getByTestId("import-confirm").click();
  await expect(p.getByTestId("import-done")).toContainText("3 joueurs ajoutés");
  expect(await countPlayers()).toBe(before + 3);
  expect((await queryTestDb<{ fftRank: string }>(`SELECT "fftRank" FROM "Player" WHERE "lastName" = 'Sansclassement'`))[0]!.fftRank).toBe("NC");
  expect((await queryTestDb<{ fftRank: string }>(`SELECT "fftRank" FROM "Player" WHERE "lastName" = '${existing!.lastName}' AND "clubId" = '${lyonId}'`))[0]!.fftRank).toBe("PREMIERE_SERIE");
  await p.reload();
  await expect(p.getByTestId("club-player").filter({ hasText: "Alice Nouvelle" })).toContainText("ans");
  await p.context().close();
});

test("import d'un classeur Excel (.xlsx) ; un format non pris en charge est refusé avec un message clair", async ({ browser }) => {
  test.setTimeout(240_000);
  const p = await login(browser, "admin_lyon");
  await p.goto(`/clubs/${lyonId}/joueurs`);
  await p.waitForLoadState("networkidle");
  const x = buildXlsx([["Nom", "Prénom", "Date de naissance", "Classement"], ["Excelle", "Eva", "03/05/2001", "30/5"], ["Excelle", "Fred", "", "NC"]]);
  await p.getByTestId("import-file").setInputFiles({ name: "club.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(x) });
  await p.getByTestId("import-preview").click();
  await expect(p.getByTestId("import-summary")).toContainText("2 nouveaux");
  const n = await countPlayers();
  await p.getByTestId("import-confirm").click();
  await expect(p.getByTestId("import-done")).toContainText("2 joueurs ajoutés");
  expect(await countPlayers()).toBe(n + 2);

  // Un fichier d'un autre type.
  await p.reload();
  await p.waitForLoadState("networkidle");
  await p.getByTestId("import-file").setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: Buffer.from("pas un tableur") });
  await p.getByTestId("import-preview").click();
  await expect(p.getByTestId("import-fatal")).toContainText("Format non pris en charge");
  await p.getByTestId("import-file").setInputFiles({ name: "sans-titres.csv", mimeType: "text/csv", buffer: Buffer.from("a;b\n1;2\n") });
  await p.getByTestId("import-preview").click();
  await expect(p.getByTestId("import-fatal")).toContainText("Titres de colonnes introuvables");
  await p.context().close();
});
