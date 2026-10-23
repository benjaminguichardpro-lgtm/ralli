import { type Browser, type Page, expect, test } from "@playwright/test";
import { checkPage, placeBet, queryTestDb, seedDemoOnTestDb, signIn, wipeTestDb } from "./helpers";

// Tournois : tableau à élimination directe avec pronostics match par match. Charge la vraie démo : « Tournoi d'automne » de TC Démo-Lyon
// (8 joueurs : deux quarts joués, deux quarts ouverts aux pronostics, une demi-finale connue). admin_lyon administre Lyon, parieur1 est membre.

test.describe.configure({ mode: "serial" });

const PASSWORD = "Demo-ralli-2026!";
let tid: string;
let lyonId: string;

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

/** « 2026-10-16T14:30 » en heure de Paris, `hours` heures plus tard (valeur d'un champ datetime-local). */
function parisInput(hours: number): string {
  const d = new Date(Date.now() + hours * 3_600_000);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

test.beforeAll(async () => {
  test.setTimeout(300_000);
  await wipeTestDb();
  seedDemoOnTestDb();
  tid = (await queryTestDb<{ id: string }>(`SELECT id FROM "Tournament" WHERE name = 'Tournoi d''automne'`))[0]!.id;
  lyonId = (await queryTestDb<{ id: string }>(`SELECT id FROM "Club" WHERE name = 'TC Démo-Lyon'`))[0]!.id;
});
test.afterAll(wipeTestDb);

test("un membre voit le tournoi sur l'accueil et la page du club, puis le tableau : quarts joués, quarts ouverts, demi-finale connue", async ({ browser }) => {
  const p = await login(browser, "parieur1");
  await p.goto("/");
  await expect(p.getByTestId("feed")).toBeVisible();
  await expect(p.getByTestId("home-tournaments-current")).toHaveCount(0); // les tournois ont leur propre onglet
  await p.getByTestId("home-tab-tournois").click();
  await expect(p.getByTestId("home-tournaments-current")).toContainText("Tournoi d'automne");
  await expect(p.getByTestId("home-tournaments-current").getByTestId("open-matches")).toBeVisible();
  await p.goto(`/clubs/${lyonId}`);
  await expect(p.getByTestId("club-tournaments")).toContainText("Tournoi d'automne");
  await p.getByTestId("club-tournaments").getByTestId("tournament-card").click();
  await expect(p).toHaveURL(new RegExp(`/tournois/${tid}$`));
  await expect(p.getByTestId("tournament-name")).toHaveText("Tournoi d'automne");
  // Quarts : 2 joués (avec leur résultat), 2 ouverts aux pronostics ; demi-finales : 1 ouverte (joueurs connus), 1 à venir ; finale à venir.
  const quarts = p.getByTestId("round-1").getByTestId("tournament-match");
  await expect(quarts).toHaveCount(4);
  await expect(quarts.nth(0)).toHaveAttribute("data-state", "done");
  await expect(quarts.nth(1)).toHaveAttribute("data-state", "done");
  await expect(quarts.nth(0).getByTestId("match-result")).toContainText("gagne");
  await expect(quarts.nth(2)).toHaveAttribute("data-state", "open");
  await expect(quarts.nth(3)).toHaveAttribute("data-state", "open");
  await expect(p.getByTestId("round-2").getByTestId("tournament-match").nth(0)).toHaveAttribute("data-state", "open");
  await expect(p.getByTestId("round-2").getByTestId("tournament-match").nth(1)).toHaveAttribute("data-state", "waiting");
  await expect(p.getByTestId("round-3").getByTestId("tournament-match")).toHaveAttribute("data-state", "waiting");
  // Pronostic déjà posé sur le quart joué (gagné) : visible. Aucun formulaire d'admin pour un membre.
  await expect(quarts.nth(0).getByTestId("my-prediction")).toBeVisible();
  await expect(p.getByTestId("tournament-manage")).toHaveCount(0);
  await checkPage(p, "tournoi-membre");

  // Pronostic sur le quart ouvert n°4 par le même parcours que les interclubs.
  const open = quarts.nth(3);
  const name = (await open.getByTestId("odds").first().locator("xpath=..").innerText()).split("\n")[0]!.replace(/\.$/, "");
  await open.getByRole("button").first().click();
  const sheet = p.getByRole("dialog", { name: "Votre pronostic" });
  await expect(sheet).toBeVisible();
  await sheet.getByLabel("Aces engagés").fill("50");
  await sheet.getByRole("button", { name: "Valider mon ralli" }).click();
  await expect(sheet).toBeHidden();
  await expect(open.getByTestId("my-prediction")).toContainText("50 Aces engagés");
  expect(name.length).toBeGreaterThan(2);
  expect((await queryTestDb(`SELECT 1 FROM "Prediction" pr JOIN "User" u ON u.id = pr."userId" WHERE u."displayName" = 'parieur1' AND pr."tournamentMatchId" IS NOT NULL`)).length).toBe(3);

  // Mes rallis : le ralli en cours du tournoi et le ralli gagné (quart 1) pointent vers la page du tournoi.
  await p.goto("/rallis");
  await expect(p.getByText("Demi-finale").or(p.getByText("Quart de finale")).first()).toBeVisible();
  await p.getByRole("link", { name: /Quart de finale/ }).first().click();
  await expect(p).toHaveURL(new RegExp(`/tournois/${tid}$`));
  await p.context().close();
});

test("un visiteur sans compte voit le tableau et les cotes, sans pouvoir pronostiquer ; la page publique du club le liste", async ({ browser, page }) => {
  await page.goto(`/tournois/${tid}`);
  await expect(page.getByTestId("tournament-name")).toBeVisible();
  await expect(page.getByTestId("odds").first()).toBeVisible();
  await expect(page.getByTestId("tournament-manage")).toHaveCount(0);
  await expect(page.getByTestId("live-open")).toHaveCount(0);
  await checkPage(page, "tournoi-visiteur");
  // Page publique du club : activée en base (l'activation par l'interface est testée ailleurs).
  await queryTestDb(`UPDATE "Club" SET "publicPage" = true, slug = 'tc-demo-lyon' WHERE id = '${lyonId}'`);
  await page.goto("/c/tc-demo-lyon");
  await expect(page.getByTestId("public-tournaments")).toContainText("Tournoi d'automne");
  await page.getByTestId("public-tournaments").getByTestId("tournament-card").click();
  await expect(page).toHaveURL(new RegExp(`/tournois/${tid}$`));
  void browser;
});

test("l'admin fixe une heure, saisit un résultat : les pronostics du match sont réglés tout de suite et le vainqueur avance", async ({ browser }) => {
  test.setTimeout(300_000);
  const admin = await login(browser, "admin_lyon");
  await admin.goto(`/tournois/${tid}`);
  await expect(admin.getByTestId("tournament-manage")).toBeVisible();
  const quarts = admin.getByTestId("round-1").getByTestId("tournament-match");
  // Le quart n°3 a commencé (on avance son heure en base) : l'admin peut saisir le résultat ; le n°4 n'a pas commencé : il peut changer l'heure.
  await queryTestDb(`UPDATE "TournamentMatch" SET "startsAt" = now() - interval '1 hour' WHERE "tournamentId" = '${tid}' AND round = 1 AND position = 2`);
  await admin.reload();
  await expect(quarts.nth(3).getByTestId("time-open")).toBeVisible();
  await expect(quarts.nth(3).getByTestId("result-open")).toHaveCount(0);
  await expect(quarts.nth(2).getByTestId("result-open")).toBeVisible();
  await expect(quarts.nth(2).getByTestId("time-open")).toHaveCount(0);
  await checkPage(admin, "tournoi-admin");
  await quarts.nth(2).getByTestId("result-open").click();
  const form = quarts.nth(2).getByTestId("tournament-result-form");
  await form.getByLabel("Vainqueur").selectOption("AWAY"); // parieur1 avait pronostiqué l'extérieur sur ce quart
  await form.getByLabel("Sets (facultatif)").fill("4-6 3-6");
  await form.getByRole("button", { name: "Enregistrer le résultat" }).click();
  await expect(quarts.nth(2)).toHaveAttribute("data-state", "done");
  await expect(quarts.nth(2).getByTestId("match-result")).toContainText("4-6 3-6");
  // Les pronostics du match sont réglés tout de suite, et la deuxième demi-finale a maintenant un joueur connu (l'autre quart n'est pas joué).
  const rows = await queryTestDb<{ status: string }>(`SELECT pr.status FROM "Prediction" pr JOIN "TournamentMatch" m ON m.id = pr."tournamentMatchId" WHERE m."tournamentId" = '${tid}' AND m.round = 1 AND m.position = 2`);
  expect(rows.map((r) => r.status)).toEqual(["WON"]);
  const sf2 = admin.getByTestId("round-2").getByTestId("tournament-match").nth(1);
  await expect(sf2).toHaveAttribute("data-state", "waiting");
  // Changer l'heure du quart n°4 (futur).
  await quarts.nth(3).getByTestId("time-open").click();
  await quarts.nth(3).getByLabel("Changer l'heure de début").fill(parisInput(30));
  await quarts.nth(3).getByRole("button", { name: "Enregistrer l'heure" }).click();
  await expect(quarts.nth(3).getByText("Heure enregistrée.")).toBeVisible();
  await admin.context().close();

  // Le membre voit son gain dans Mes rallis.
  const m = await login(browser, "parieur1");
  await m.goto("/rallis");
  await expect(m.getByText("Aces gagnés").first()).toBeVisible();
  await m.context().close();
});

test("créer un tournoi de 4 joueurs de A à Z : brouillon invisible des membres, tableau, publication, pronostics ouverts", async ({ browser }) => {
  test.setTimeout(400_000);
  const admin = await login(browser, "admin_nantes");
  await admin.goto("/clubs");
  await admin.getByRole("link", { name: /TC Démo-Nantes/ }).first().click();
  await admin.getByRole("link", { name: "Nouveau tournoi" }).click();
  await admin.getByLabel("Nom du tournoi").fill("Open de Nantes");
  await admin.getByLabel("Taille du tableau").selectOption("4");
  await admin.getByLabel("Date de début du tournoi").fill(parisInput(24));
  await admin.getByRole("button", { name: "Créer le tournoi" }).click();
  await expect(admin.getByTestId("draft-section")).toBeVisible();
  await expect(admin.getByTestId("entries-count")).toHaveText("0 / 4");
  const newId = admin.url().split("/").pop()!;

  // Un membre simple ne voit pas un brouillon.
  const member = await login(browser, "parieur1");
  await member.goto(`/tournois/${newId}`);
  await expect(member.getByRole("heading", { name: "Page introuvable" })).toBeVisible();

  // Quatre joueurs d'autres clubs (leur club est demandé).
  const players = [["Alex", "Dumont", "30"], ["Bruno", "Lopez", "30/1"], ["Carla", "Moreau", "30/2"], ["David", "Faure", "30/3"]] as const;
  for (const [i, [first, last, rank]] of players.entries()) {
    const form = admin.getByTestId("add-new-entry");
    if (i === 0) await admin.getByText("Ajouter un joueur d'un autre club").click();
    await form.getByLabel("Prénom").fill(first);
    await form.getByLabel("Nom", { exact: true }).fill(last);
    await form.getByLabel("Niveau FFT").selectOption({ label: rank });
    if (i === 0) {
      await form.getByRole("button", { name: "Ajouter et inscrire" }).click();
      await expect(admin.getByTestId("add-new-entry").getByText("Indique son club")).toBeVisible(); // le club du joueur est obligatoire
    }
    await admin.getByTestId("add-new-entry").getByLabel("Club du joueur").fill("TC des Flandres");
    await admin.getByTestId("add-new-entry").getByRole("button", { name: "Ajouter et inscrire" }).click();
    await expect(admin.getByTestId("entries-count")).toHaveText(`${i + 1} / 4`);
  }
  // Publier trop tôt : message d'erreur, rien ne change.
  await admin.getByTestId("publish-tournament").click();
  await expect(admin.getByText(/Complète le tableau/)).toBeVisible();

  // Tableau du premier tour : Alex – Bruno et Carla – David, avec leurs heures.
  const first = admin.getByTestId("first-round-form");
  await first.getByLabel("Match 1 · joueur domicile").selectOption({ label: "Alex Dumont (30)" });
  await first.getByLabel("Match 1 · joueur extérieur").selectOption({ label: "Bruno Lopez (30/1)" });
  await first.getByLabel("Match 1 · heure de début").fill(parisInput(26));
  await first.getByLabel("Match 2 · joueur domicile").selectOption({ label: "Carla Moreau (30/2)" });
  await first.getByLabel("Match 2 · joueur extérieur").selectOption({ label: "David Faure (30/3)" });
  await first.getByLabel("Match 2 · heure de début").fill(parisInput(28));
  await first.getByRole("button", { name: "Enregistrer le tableau" }).click();
  await expect(first.getByText("Tableau enregistré.")).toBeVisible();
  await admin.getByTestId("publish-tournament").click();
  await expect(admin.getByTestId("draft-section")).toHaveCount(0);
  await expect(admin.getByTestId("round-1").getByTestId("tournament-match")).toHaveCount(2);
  await expect(admin.getByTestId("round-2").getByTestId("tournament-match")).toHaveAttribute("data-state", "waiting");

  // Publié : le membre le voit et peut pronostiquer ; l'admin, non.
  await member.reload();
  await expect(member.getByTestId("tournament-name")).toHaveText("Open de Nantes");
  await expect(member.getByTestId("round-1").getByTestId("tournament-match").first()).toHaveAttribute("data-state", "open");
  await expect(member.getByTestId("round-1").getByTestId("tournament-match").first().getByTestId("odds").first()).toBeVisible();
  await expect(admin.getByTestId("round-1").getByRole("button", { name: /Alex/ }).first()).toBeVisible(); // cotes affichées à l'admin
  await member.context().close();
  await admin.context().close();
  void placeBet;
});
