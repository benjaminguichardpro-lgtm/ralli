import { type Browser, type Page, expect, test } from "@playwright/test";
import { checkPage, queryTestDb, seedDemoOnTestDb, signIn, wipeTestDb } from "./helpers";

// Export de l'affiche en image PNG (écran 1920 × 1080, story 1080 × 1920) : réservé au personnel du tournoi, une image par page.
// Charge la vraie démo : « Tournoi d'automne » de TC Démo-Lyon. admin_lyon administre Lyon ; capitaine_dames_lyon sera juge-arbitre.

test.describe.configure({ mode: "serial" });

const PASSWORD = "demo-ralli-2026";
let tid: string;
let bigId: string;

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

/** Largeur et hauteur d'un PNG, lues dans son en-tête (octets 16 à 23). */
function pngSize(body: Buffer): { width: number; height: number } {
  expect(body.subarray(0, 8).toString("hex"), "signature PNG").toBe("89504e470d0a1a0a");
  return { width: body.readUInt32BE(16), height: body.readUInt32BE(20) };
}

const image = (id: string, query: string) => `/tournois/${id}/affiche/image?${query}`;

test.beforeAll(async () => {
  test.setTimeout(300_000);
  await wipeTestDb();
  seedDemoOnTestDb();
  tid = (await queryTestDb<{ id: string }>(`SELECT id FROM "Tournament" WHERE name = 'Tournoi d''automne'`))[0]!.id;
  // Un tournoi de 32 joueurs dont les 16 matchs du premier tour ont une heure : 16 lignes = 2 pages à l'écran, 1 page en story.
  bigId = (
    await queryTestDb<{ id: string }>(
      `INSERT INTO "Tournament" (id, "clubId", name, "drawSize", "startsAt", status, "createdById", "publishedAt")
       SELECT 'tournoi-32', "clubId", 'Grand tournoi', 32, now() + interval '1 day', 'OPEN', "createdById", now() FROM "Tournament" WHERE id = '${tid}' RETURNING id`,
    )
  )[0]!.id;
  await queryTestDb(
    `INSERT INTO "TournamentMatch" (id, "tournamentId", round, position, "startsAt")
     SELECT 'grand-' || g, '${bigId}', 1, g, now() + interval '1 day' + g * interval '15 minutes' FROM generate_series(0, 15) g`,
  );
  await queryTestDb(
    `INSERT INTO "TournamentReferee" ("tournamentId", "userId", "addedById")
     SELECT '${tid}', u.id, a.id FROM "User" u, "User" a WHERE u."displayName" = 'capitaine_dames_lyon' AND a."displayName" = 'admin_lyon'`,
  );
});
test.afterAll(wipeTestDb);

test("l'image est réservée au personnel : sans compte 401, simple membre et formats ou pages inconnus 404", async ({ browser, page }) => {
  expect((await page.request.get(image(tid, "format=ecran&page=1"))).status()).toBe(401);
  const member = await login(browser, "parieur1");
  expect((await member.request.get(image(tid, "format=ecran&page=1"))).status()).toBe(404);
  await member.goto(`/tournois/${tid}/affiche`);
  await expect(member.getByTestId("poster")).toBeVisible();
  await expect(member.getByTestId("poster-export")).toHaveCount(0); // l'affiche se lit, mais le bouton est réservé au personnel
  await member.context().close();

  const admin = await login(browser, "admin_lyon");
  expect((await admin.request.get(image(tid, "format=carre&page=1"))).status()).toBe(404);
  expect((await admin.request.get(image(tid, "format=ecran&page=0"))).status()).toBe(404);
  expect((await admin.request.get(image(tid, "format=ecran&page=2"))).status()).toBe(404); // le tournoi de démo n'a qu'une page
  expect((await admin.request.get(image("inconnu", "format=ecran&page=1"))).status()).toBe(404);
  await admin.context().close();
});

test("les images ont la taille exacte de chaque format, sont des PNG jamais mis en cache, et se téléchargent", async ({ browser }) => {
  const admin = await login(browser, "admin_lyon");
  const ecran = await admin.request.get(image(tid, "format=ecran&page=1"));
  expect(ecran.status()).toBe(200);
  expect(ecran.headers()["content-type"]).toBe("image/png");
  expect(ecran.headers()["cache-control"]).toContain("no-store");
  expect(pngSize(await ecran.body())).toEqual({ width: 1920, height: 1080 });

  const story = await admin.request.get(image(tid, "format=story&page=1"));
  expect(story.status()).toBe(200);
  expect(pngSize(await story.body())).toEqual({ width: 1080, height: 1920 });

  const dl = await admin.request.get(image(tid, "format=story&page=1&telecharger=1"));
  expect(dl.headers()["content-disposition"]).toBe('attachment; filename="affiche-tournoi-d-automne-story-1.png"');
  expect(ecran.headers()["content-disposition"]).toBeUndefined();
  await admin.context().close();
});

test("un juge-arbitre peut créer les images, comme un admin", async ({ browser }) => {
  const ref = await login(browser, "capitaine_dames_lyon");
  const res = await ref.request.get(image(tid, "format=ecran&page=1"));
  expect(res.status()).toBe(200);
  expect(pngSize(await res.body())).toEqual({ width: 1920, height: 1080 });
  await ref.goto(`/tournois/${tid}/affiche`);
  await expect(ref.getByTestId("poster-export")).toBeVisible();
  await ref.context().close();
});

test("plusieurs pages : 16 matchs = 2 images à l'écran, 1 en story, la page 3 n'existe pas", async ({ browser }) => {
  const admin = await login(browser, "admin_lyon");
  expect((await admin.request.get(image(bigId, "format=ecran&page=2"))).status()).toBe(200);
  expect((await admin.request.get(image(bigId, "format=ecran&page=3"))).status()).toBe(404);
  expect((await admin.request.get(image(bigId, "format=story&page=1"))).status()).toBe(200);
  expect((await admin.request.get(image(bigId, "format=story&page=2"))).status()).toBe(404);
  await admin.context().close();
});

test("« Créer l'image » : choix du format, fenêtre « Ton affiche est prête », une image par page avec télécharger", async ({ browser }) => {
  const admin = await login(browser, "admin_lyon");
  await admin.goto(`/tournois/${bigId}/affiche`);
  const box = admin.getByTestId("poster-export");
  await expect(box).toBeVisible();
  await checkPage(admin, "affiche-export");
  // Écran (par défaut) : 2 pages, bouton « Créer les 2 images ».
  await expect(box.getByTestId("poster-create")).toHaveText("Créer les 2 images");
  await box.getByTestId("poster-create").click();
  const ready = admin.getByTestId("poster-ready");
  await expect(ready).toBeVisible();
  await expect(ready.getByRole("heading", { name: "Ton affiche est prête" })).toBeVisible();
  await expect(ready.getByTestId("poster-image-item")).toHaveCount(2);
  await expect(ready.getByTestId("poster-download")).toHaveText(["Télécharger l'image 1", "Télécharger l'image 2"]);
  const first = ready.getByTestId("poster-image").first();
  await first.scrollIntoViewIfNeeded();
  await expect.poll(async () => first.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth)).toBe(1920);
  expect(await first.evaluate((i: HTMLImageElement) => i.naturalHeight)).toBe(1080);
  expect(await ready.getByTestId("poster-download").first().getAttribute("href")).toContain("telecharger=1");
  await admin.screenshot({ path: "test-results/screens/affiche-export-prete.png" });
  await ready.getByTestId("poster-close").click();
  await expect(ready).toBeHidden();

  // Story : une seule page, bouton « Créer l'image », image 1080 × 1920.
  await box.getByLabel(/Story/).check();
  await expect(box.getByTestId("poster-create")).toHaveText("Créer l'image");
  await box.getByTestId("poster-create").click();
  await expect(ready.getByTestId("poster-image-item")).toHaveCount(1);
  const story = ready.getByTestId("poster-image");
  await expect.poll(async () => story.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth)).toBe(1080);
  expect(await story.evaluate((i: HTMLImageElement) => i.naturalHeight)).toBe(1920);
  await admin.keyboard.press("Escape"); // la fenêtre se ferme aussi avec Échap
  await expect(ready).toBeHidden();
  await admin.context().close();
});
