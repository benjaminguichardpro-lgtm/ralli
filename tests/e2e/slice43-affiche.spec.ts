import { type Browser, type Page, expect, test } from "@playwright/test";
import { checkPage, queryTestDb, seedDemoOnTestDb, signIn, wipeTestDb } from "./helpers";

// Affiche du tournoi et juges-arbitres. Charge la vraie démo : « Tournoi d'automne » de TC Démo-Lyon (8 joueurs, quarts joués ou ouverts).
// admin_lyon administre Lyon ; capitaine_dames_lyon est nommé juge-arbitre ; parieur1 reste un simple membre.

test.describe.configure({ mode: "serial" });

const PASSWORD = "Demo-ralli-2026!";
let tid: string;

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

test.beforeAll(async () => {
  test.setTimeout(300_000);
  await wipeTestDb();
  seedDemoOnTestDb();
  tid = (await queryTestDb<{ id: string }>(`SELECT id FROM "Tournament" WHERE name = 'Tournoi d''automne'`))[0]!.id;
});
test.afterAll(wipeTestDb);

test("l'admin règle le sigle et le lieu de l'affiche, et nomme un juge-arbitre", async ({ browser }) => {
  const admin = await login(browser, "admin_lyon");
  await admin.goto(`/tournois/${tid}`);
  const section = admin.getByTestId("poster-section");
  await expect(section).toBeVisible();
  await expect(admin.getByTestId("poster-link")).toHaveText("Générer la fiche");

  const info = section.getByTestId("tournament-info-form");
  await info.getByLabel("Sigle du tableau").fill("sm");
  await info.getByLabel("Lieu").fill("Complexe des Flandres");
  await info.getByRole("button", { name: "Enregistrer" }).click();
  await expect(info.getByText("Infos de l'affiche enregistrées.")).toBeVisible();

  await section.getByTestId("add-referee").getByLabel("Membre du club").selectOption({ label: "capitaine_dames_lyon" });
  await section.getByTestId("add-referee").getByRole("button", { name: "Nommer juge-arbitre" }).click();
  await expect(section.getByTestId("referee")).toHaveCount(1);
  await expect(section.getByTestId("referee")).toContainText("capitaine_dames_lyon");
  await checkPage(admin, "affiche-admin");

  // Un sigle invalide est refusé avec un message clair.
  await info.getByLabel("Sigle du tableau").fill("SM SD");
  await info.getByRole("button", { name: "Enregistrer" }).click();
  await expect(info.getByText(/Sigle du tableau/).last()).toBeVisible();
  await admin.context().close();
});

test("le juge-arbitre prépare : il voit la gestion et « Générer la fiche », pas la nomination ni l'annulation ; il ne pronostique pas", async ({ browser }) => {
  const ref = await login(browser, "capitaine_dames_lyon");
  await ref.goto(`/tournois/${tid}`);
  await expect(ref.getByTestId("poster-link")).toHaveText("Générer la fiche");
  await expect(ref.getByTestId("tournament-manage")).toBeVisible();
  await expect(ref.getByTestId("tournament-manage").getByTestId("cancel-tournament")).toHaveCount(0);
  await expect(ref.getByTestId("referees")).toContainText("capitaine_dames_lyon");
  await expect(ref.getByTestId("add-referee")).toHaveCount(0);
  await expect(ref.getByRole("button", { name: "Retirer" })).toHaveCount(0);
  // Il peut régler l'heure d'un quart qui n'a pas commencé.
  const quarts = ref.getByTestId("round-1").getByTestId("tournament-match");
  await expect(quarts.nth(3).getByTestId("time-open")).toBeVisible();
  // Anti-trucage : la note sous les cotes ouvertes explique pourquoi il ne pronostique pas.
  await expect(quarts.nth(3).getByTestId("blocked")).toContainText("juge-arbitre");
  await checkPage(ref, "affiche-arbitre");
  await ref.context().close();
});

test("un membre simple ne voit ni la préparation ni les juges-arbitres, seulement « Voir l'affiche »", async ({ browser }) => {
  const m = await login(browser, "parieur1");
  await m.goto(`/tournois/${tid}`);
  await expect(m.getByTestId("poster-link")).toHaveText("Voir l'affiche");
  await expect(m.getByTestId("poster-section")).toHaveCount(0);
  await expect(m.getByTestId("referees")).toHaveCount(0);
  await m.context().close();
});

test("l'affiche : titre, lieu, sigle, joueurs en « Prénom Nom », vainqueur mis en avant, légende ; lisible sans compte", async ({ page }) => {
  await page.goto(`/tournois/${tid}/affiche`);
  const poster = page.getByTestId("poster");
  await expect(poster).toBeVisible();
  await expect(page.getByTestId("poster-title")).toHaveText("Tournoi d'automne");
  await expect(page.getByTestId("poster-club")).toHaveText("TC Démo-Lyon");
  await expect(page.getByTestId("poster-venue")).toHaveText("Complexe des Flandres");
  await expect(page.getByTestId("poster-date")).toContainText("Matchs du");
  const rows = poster.getByTestId("poster-row");
  expect(await rows.count()).toBeGreaterThanOrEqual(5);
  await expect(rows.first()).toContainText("SM");
  // Noms complets « Prénom Nom » : jamais d'initiale seule suivie d'un point.
  const names = await poster.getByTestId("poster-player").allInnerTexts();
  for (const n of names) if (n !== "À déterminer") expect(n, `nom « ${n} »`).toMatch(/^\S+(?: \S+)+$/u);
  for (const n of names) expect(n).not.toMatch(/ \p{Lu}\.$/u);
  // Un quart est joué : son vainqueur est mis en avant (cases foncées, « V »), le score en barres.
  const done = poster.locator('[data-testid="poster-row"][data-done="true"]').first();
  await expect(done.locator('[data-won="true"]').first()).toBeVisible();
  await expect(done.getByTestId("poster-score")).toContainText(/[◀▶]/);
  await expect(done).toContainText("V");
  await expect(page.getByTestId("poster-legend")).toContainText("FT4SD : Fin de tableau 4ème série dames");
  await expect(page.getByTestId("poster-legend")).toContainText("TFDoubles : Tennis fauteuil doubles");
  await expect(page.getByTestId("poster-fullscreen")).toBeVisible();
  await checkPage(page, "affiche-visiteur");
});

test("l'affiche suit le tableau : un score saisi par le juge-arbitre y apparaît ; les brouillons restent privés", async ({ browser, page }) => {
  const ref = await login(browser, "capitaine_dames_lyon");
  await queryTestDb(`UPDATE "TournamentMatch" SET "startsAt" = now() - interval '1 hour' WHERE "tournamentId" = '${tid}' AND round = 1 AND position = 2`);
  await ref.goto(`/tournois/${tid}`);
  const quart = ref.getByTestId("round-1").getByTestId("tournament-match").nth(2);
  await quart.getByTestId("result-open").click();
  const form = quart.getByTestId("tournament-result-form");
  await form.getByLabel("Vainqueur").selectOption("HOME");
  await form.getByLabel("Sets (facultatif)").fill("6-3 6-2");
  await form.getByRole("button", { name: "Enregistrer le résultat" }).click();
  await expect(quart).toHaveAttribute("data-state", "done");
  await ref.context().close();

  await page.goto(`/tournois/${tid}/affiche`);
  await expect(page.getByTestId("poster")).toContainText("6/3 6/2");

  // Un brouillon : introuvable pour un visiteur.
  const draft = (await queryTestDb<{ id: string }>(`INSERT INTO "Tournament" (id, "clubId", name, "drawSize", "startsAt", status, "createdById") SELECT 'brouillon-affiche', "clubId", 'Brouillon secret', 4, now() + interval '2 days', 'DRAFT', "createdById" FROM "Tournament" WHERE id = '${tid}' RETURNING id`))[0]!.id;
  await page.goto(`/tournois/${draft}/affiche`);
  await expect(page.getByRole("heading", { name: "Page introuvable" })).toBeVisible();
  await expect(page.getByTestId("poster")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("Brouillon secret");
});
