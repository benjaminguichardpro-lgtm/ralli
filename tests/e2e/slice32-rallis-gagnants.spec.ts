import { type Browser, type Page, expect, test } from "@playwright/test";
import { checkPage, queryTestDb, seedDemoOnTestDb, signIn, wipeTestDb } from "./helpers";

// Rallis gagnants en story : un membre partage une victoire (aperçu, commentaire, confirmation, WhatsApp), les autres membres
// la voient dans le rond « Rallis gagnants », réagissent 🎾 et signalent ; un admin supprime la carte signalée.
// Charge la vraie démo ; le ralli gagné est le plus récent de la démo, daté d'aujourd'hui pour tenir dans les 7 jours.

test.describe.configure({ mode: "serial" });

const PASSWORD = "demo-ralli-2026";
let predictionId: string, author: string, club: string, clubId: string, reader: string, admin: string;

async function login(b: Browser, pseudo: string): Promise<Page> {
  const p = await (await b.newContext()).newPage();
  p.on("dialog", (d) => void d.accept());
  await signIn(p, pseudo, PASSWORD, pseudo);
  await expect(p.getByTestId("nav-user")).toHaveText(pseudo);
  // Fenêtres d'accueil, une à la fois : le récapitulatif des résultats (le ralli de la démo vient d'être daté d'aujourd'hui)
  // puis le bonus du jour. On ferme ce qui s'ouvre jusqu'à ce que plus rien n'apparaisse.
  const recap = p.getByTestId("results-recap");
  const popup = p.getByTestId("daily-bonus");
  for (let i = 0; i < 3; i++) {
    const which = await Promise.race([
      recap.waitFor({ timeout: 8000 }).then(() => "recap" as const),
      popup.waitFor({ timeout: 8000 }).then(() => "bonus" as const),
    ]).catch(() => null);
    if (which === "recap") await p.keyboard.press("Escape");
    else if (which === "bonus") await popup.getByRole("button", { name: "Super" }).click();
    else break;
    await expect(which === "recap" ? recap : popup).toBeHidden();
  }
  return p;
}

test.beforeAll(async () => {
  test.setTimeout(300_000);
  await wipeTestDb(); // un fichier lancé juste avant a pu laisser sa démo dans la base de test
  seedDemoOnTestDb();
  const win = (
    await queryTestDb<{ id: string; author: string; club: string; clubId: string }>(
      `SELECT p.id, u."displayName" AS author, c.name AS club, c.id AS "clubId"
       FROM "Prediction" p JOIN "User" u ON u.id = p."userId" JOIN "Match" m ON m.id = p."matchId"
       JOIN "Encounter" e ON e.id = m."encounterId" JOIN "Club" c ON c.id = e."organizerClubId"
       JOIN "ClubMembership" cm ON cm."userId" = u.id AND cm."clubId" = c.id
       WHERE p.status = 'WON' AND e.status = 'CONFIRMED' ORDER BY p."settledAt" DESC LIMIT 1`,
    )
  )[0]!;
  ({ id: predictionId, author, club, clubId } = win);
  await queryTestDb(`UPDATE "Prediction" SET "settledAt" = now() WHERE id = $1`, [predictionId]);
  reader = (await queryTestDb<{ n: string }>(`SELECT u."displayName" AS n FROM "ClubMembership" cm JOIN "User" u ON u.id = cm."userId" WHERE cm."clubId" = $1 AND cm.role = 'MEMBER' AND u."displayName" <> $2 ORDER BY u."displayName" LIMIT 1`, [clubId, author]))[0]!.n;
  admin = (await queryTestDb<{ n: string }>(`SELECT u."displayName" AS n FROM "ClubMembership" cm JOIN "User" u ON u.id = cm."userId" WHERE cm."clubId" = $1 AND cm.role = 'ADMIN' AND u."displayName" <> $2 LIMIT 1`, [clubId, author]))[0]!.n;
});
test.afterAll(wipeTestDb);

test("l'auteur partage sa victoire : aperçu, commentaire, confirmation, WhatsApp", async ({ browser }) => {
  const p = await login(browser, author);
  await p.goto(`/rallis?partage=${predictionId}`);
  const dialog = p.getByTestId("share-win-dialog");
  await expect(dialog).toBeVisible();
  const card = dialog.getByTestId("win-card");
  await expect(card.getByTestId("win-card-author")).toHaveText(author);
  await expect(card.getByTestId("win-card-payout")).toBeVisible();
  await expect(card).toContainText("Ralli gagnant");
  await dialog.getByLabel("Un mot pour le club (facultatif)").fill("Quel match !");
  await expect(dialog.getByTestId("win-comment-counter")).toHaveText("12/140");
  await expect(card.getByTestId("win-card-comment")).toHaveText("« Quel match ! »");
  await dialog.getByRole("button", { name: "Continuer" }).click();
  await expect(dialog.getByTestId("share-win-confirm")).toContainText(`Publier pour ${club} ?`);
  await dialog.getByRole("button", { name: "Modifier" }).click();
  await expect(dialog.getByLabel("Un mot pour le club (facultatif)")).toHaveValue("Quel match !");
  await dialog.getByRole("button", { name: "Continuer" }).click();
  await dialog.getByRole("button", { name: "Publier" }).click();
  const done = dialog.getByTestId("share-win-done");
  await expect(done).toContainText("Ta victoire est partagée avec le club pendant 24 h.");
  const wa = done.getByRole("link", { name: "Partager aussi sur WhatsApp" });
  await expect(wa).toHaveAttribute("href", /^https:\/\/wa\.me\/\?text=/);
  expect(decodeURIComponent((await wa.getAttribute("href"))!)).toMatch(/J'ai gagné [\d\s  ]+ Aces sur .+ avec Ralli ! .+\/rencontres\//);
  await done.getByRole("button", { name: "Fermer" }).click();
  await expect(dialog).toBeHidden();
  await expect(p.getByTestId("win-shared").first()).toBeVisible();
  await checkPage(p, "rallis-victoire-partagee");
  // Déjà partagé : le lien du récapitulatif n'ouvre plus rien.
  await p.goto(`/rallis?partage=${predictionId}`);
  await expect(p.getByTestId("share-win-dialog")).toHaveCount(0);
  // Une seule carte en base, avec le commentaire.
  const rows = await queryTestDb<{ n: string; body: string }>(`SELECT count(*)::text AS n, max(body) AS body FROM "Story" WHERE "predictionId" = $1 AND kind = 'WIN_CARD' AND "deletedAt" IS NULL`, [predictionId]);
  expect(rows[0]).toEqual({ n: "1", body: "Quel match !" });
  await p.context().close();
});

test("un autre membre voit la carte dans « Rallis gagnants », réagit 🎾 puis signale", async ({ browser }) => {
  const p = await login(browser, reader);
  await p.goto("/");
  const ring = p.getByRole("button", { name: new RegExp(`^Rallis gagnants de ${club}`) });
  await expect(ring).toHaveAttribute("data-unseen", "true");
  await ring.click();
  const viewer = p.getByTestId("story-viewer");
  await expect(viewer.getByTestId("story-title")).toHaveText("Rallis gagnants");
  await expect(viewer.getByTestId("win-card-author")).toHaveText(author);
  await expect(viewer.getByTestId("win-card-comment")).toHaveText("« Quel match ! »");
  // Réaction : une seule par membre, retirable.
  const react = viewer.getByTestId("win-react");
  await expect(react).toHaveAttribute("aria-pressed", "false");
  await expect(viewer.getByTestId("win-react-count")).toHaveText("0");
  await react.click();
  await expect(viewer.getByTestId("win-react-count")).toHaveText("1");
  await expect(react).toHaveAttribute("aria-pressed", "true");
  await react.click();
  await expect(viewer.getByTestId("win-react-count")).toHaveText("0");
  await react.click();
  await expect(viewer.getByTestId("win-react-count")).toHaveText("1");
  await expect(viewer.getByTestId("win-react-names")).toHaveCount(0); // les noms : l'auteur et les admins seulement
  await expect(viewer.getByRole("link", { name: /WhatsApp/ })).toHaveCount(0); // le partage WhatsApp est celui de l'auteur
  // Signalement : motif facultatif, confirmation, une seule fois.
  await viewer.getByTestId("win-report-open").click();
  await viewer.getByLabel("Pourquoi ? (facultatif)").fill("Commentaire déplacé");
  await viewer.getByRole("button", { name: "Envoyer le signalement" }).click();
  await expect(viewer.getByTestId("win-reported")).toHaveText("Signalée aux admins");
  await expect(viewer.getByTestId("win-report-open")).toHaveCount(0);
  await viewer.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(ring).toHaveAttribute("data-unseen", "false");
  expect(Number((await queryTestDb<{ n: string }>(`SELECT count(*)::text AS n FROM "StoryReaction"`))[0]!.n)).toBe(1);
  await p.context().close();
});

test("l'auteur ne peut ni réagir ni signaler sa carte ; il voit qui a réagi et peut la partager sur WhatsApp", async ({ browser }) => {
  const p = await login(browser, author);
  await p.goto("/");
  await p.getByRole("button", { name: new RegExp(`^Rallis gagnants de ${club}`) }).click();
  const viewer = p.getByTestId("story-viewer");
  await expect(viewer.getByTestId("win-react")).toBeDisabled();
  await expect(viewer.getByTestId("win-react-count")).toHaveText("1");
  await expect(viewer.getByTestId("win-react-names")).toContainText(reader);
  await expect(viewer.getByTestId("win-report-open")).toHaveCount(0);
  await expect(viewer.getByRole("link", { name: "Partager sur WhatsApp" })).toBeVisible();
  await expect(viewer.getByRole("button", { name: "Supprimer" })).toBeVisible(); // l'auteur peut retirer sa carte
  await p.context().close();
});

test("un admin voit la carte signalée avec son motif (sans le nom du signaleur) et la supprime", async ({ browser }) => {
  const p = await login(browser, admin);
  await p.goto(`/clubs/${clubId}`);
  const reports = p.getByTestId("story-reports");
  await expect(reports.getByRole("heading", { name: "Cartes signalées (1)" })).toBeVisible();
  await expect(reports).toContainText(`Carte de ${author}`);
  await expect(reports).toContainText("Motif : Commentaire déplacé");
  await expect(reports).not.toContainText(reader);
  await checkPage(p, "cartes-signalees");
  await reports.getByRole("button", { name: `Supprimer la carte de ${author}` }).click();
  await expect(p.getByTestId("story-reports")).toHaveCount(0);
  const rows = await queryTestDb<{ deleted: boolean; open: string }>(
    `SELECT ("deletedAt" IS NOT NULL) AS deleted, (SELECT count(*)::text FROM "StoryReport" r WHERE r."storyId" = s.id AND r."handledAt" IS NULL) AS open FROM "Story" s WHERE s."predictionId" = $1`,
    [predictionId],
  );
  expect(rows).toEqual([{ deleted: true, open: "0" }]);
  await p.context().close();
});

test("après la suppression, le rond a disparu et l'auteur peut partager de nouveau ; un simple membre ne voit aucun signalement", async ({ browser }) => {
  const r = await login(browser, reader);
  await r.goto("/");
  await expect(r.getByRole("button", { name: new RegExp(`^Rallis gagnants de ${club}`) })).toHaveCount(0);
  await r.goto(`/clubs/${clubId}`);
  await expect(r.getByTestId("story-reports")).toHaveCount(0);
  await r.context().close();
  const a = await login(browser, author);
  await a.goto(`/rallis?partage=${predictionId}`);
  await expect(a.getByTestId("share-win-dialog")).toBeVisible();
  await a.context().close();
});
