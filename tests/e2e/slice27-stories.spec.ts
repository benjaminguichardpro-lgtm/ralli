import { type Browser, type Page, expect, test } from "@playwright/test";
import { checkPage, queryTestDb, seedDemoOnTestDb, signIn, wipeTestDb } from "./helpers";

// Stories de club : publication (admin, capitaine), lecture plein écran, liseré des non vues, « à la une » du club, suppression.
// Charge la vraie démo : TC Démo-Lyon (admin_lyon, capitaine_lyon de Messieurs 1, parieur1 et parieur4 simples membres),
// TC Démo-Nantes (parieur1 membre). La démo pose : une annonce épinglée à la une de Lyon, une story de Messieurs 1, une annonce
// de Nantes déjà vue par parieur1.

test.describe.configure({ mode: "serial" });

const PASSWORD = "demo-ralli-2026";
let lyonId: string;

const newPage = async (b: Browser) => (await b.newContext()).newPage();

async function login(b: Browser, pseudo: string): Promise<Page> {
  const page = await newPage(b);
  page.on("dialog", (d) => void d.accept());
  await signIn(page, pseudo, PASSWORD, pseudo);
  await expect(page.getByTestId("nav-user")).toHaveText(pseudo);
  const popup = page.getByTestId("daily-bonus");
  if (await popup.waitFor({ timeout: 5000 }).then(() => true, () => false)) await popup.getByRole("button", { name: "Super" }).click();
  await expect(popup).toBeHidden();
  return page;
}


test.beforeAll(async () => {
  test.setTimeout(300_000);
  seedDemoOnTestDb();
  lyonId = (await queryTestDb<{ id: string }>(`SELECT id FROM "Club" WHERE name = 'TC Démo-Lyon'`))[0]!.id;
});
test.afterAll(async () => {
  await wipeTestDb();
});

test("membre de deux clubs : un rond par club et par équipe, les non vues en liseré, pas de « + »", async ({ browser }) => {
  const p = await login(browser, "parieur1");
  await p.goto("/");
  const bar = p.getByTestId("stories-bar");
  await expect(bar).toBeVisible();
  await expect(p.getByTestId("story-add")).toHaveCount(0);
  await expect(p.getByTestId("story-ring")).toHaveCount(3); // Lyon, Lyon · Messieurs 1, Nantes
  await expect(p.getByRole("button", { name: /Stories de TC Démo-Lyon \(1 non vue\)/ })).toHaveAttribute("data-unseen", "true");
  await expect(p.getByRole("button", { name: /Stories de TC Démo-Lyon · Messieurs 1/ })).toHaveAttribute("data-unseen", "true");
  const nantes = p.getByRole("button", { name: "Stories de TC Démo-Nantes" });
  await expect(nantes).toHaveAttribute("data-unseen", "false");
  // La story déjà vue est rangée après les non vues.
  const order = await p.getByTestId("story-ring").evaluateAll((els) => els.map((e) => e.getAttribute("data-unseen")));
  expect(order).toEqual(["true", "true", "false"]);
  await checkPage(p, "stories-accueil");
  await p.context().close();
});

test("lecture plein écran : la story s'affiche, se marque vue, le liseré disparaît ; ni compteur ni suppression pour un membre", async ({ browser }) => {
  const p = await login(browser, "parieur1");
  await p.goto("/");
  await p.getByRole("button", { name: /Stories de TC Démo-Lyon \(1 non vue\)/ }).click();
  const viewer = p.getByTestId("story-viewer");
  await expect(viewer).toBeVisible();
  await expect(viewer.getByTestId("story-text")).toContainText("Interclubs samedi : rendez-vous à 13 h au club");
  await expect(viewer.getByTestId("story-views")).toHaveText("");
  await expect(viewer.getByRole("button", { name: "Supprimer" })).toHaveCount(0);
  await viewer.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(viewer).toBeHidden();
  await expect(p.getByRole("button", { name: /Stories de TC Démo-Lyon$/ })).toHaveAttribute("data-unseen", "false");
  // La vue est bien enregistrée côté serveur, une seule fois.
  const rows = await queryTestDb<{ n: string }>(`SELECT count(*)::text AS n FROM "StoryView" v JOIN "User" u ON u.id = v."userId" WHERE u."displayName" = 'parieur1'`);
  expect(Number(rows[0]!.n)).toBe(2); // Nantes (démo) + Lyon (à l'instant)
  await p.context().close();
});

test("admin : publier avec aperçu et confirmation, à la une, compteur de vues visible", async ({ browser }) => {
  const p = await login(browser, "admin_lyon");
  await p.goto("/");
  await p.getByTestId("story-add").click();
  const composer = p.getByTestId("story-composer");
  await expect(composer.getByRole("button", { name: "Aperçu" })).toBeDisabled();
  await composer.getByLabel("Ton message").fill("Soirée du club vendredi 20 h, venez nombreux !");
  await expect(composer.getByTestId("story-counter")).toHaveText("46/280");
  await composer.locator("label:has(input[value=clay])").click();
  await expect(composer.getByRole("radio", { name: /Terre battue/ })).toBeChecked();
  await composer.getByLabel("Aussi à la une du club").check();
  // Sur la une, la story va dans une collection nommée (comme les « à la une ») : existante ou nouvelle, obligatoire.
  await composer.getByLabel("Collection à la une").selectOption({ label: "Nouvelle collection…" });
  await expect(composer.getByRole("button", { name: "Aperçu" })).toBeDisabled();
  await composer.getByLabel("Nom de la collection").fill("Soirée du club");
  await composer.getByRole("button", { name: "Aperçu" }).click();
  await expect(composer.getByTestId("story-preview")).toContainText("Publier pour tout le club TC Démo-Lyon ? Elle restera aussi à la une du club, dans la collection « Soirée du club ».");
  await composer.getByRole("button", { name: "Modifier" }).click();
  await expect(composer.getByLabel("Ton message")).toHaveValue("Soirée du club vendredi 20 h, venez nombreux !");
  await composer.getByRole("button", { name: "Aperçu" }).click();
  await composer.getByRole("button", { name: "Publier" }).click();
  await expect(composer).toBeHidden();
  await expect(p.getByRole("button", { name: /Stories de TC Démo-Lyon/ }).first()).toBeVisible();
  // L'auteur voit le compteur de vues (0 pour l'instant).
  await p.getByRole("button", { name: /Stories de TC Démo-Lyon \(/ }).first().click();
  await expect(p.getByTestId("story-viewer").getByTestId("story-views")).toContainText(/Vue par \d+ membre/);
  await p.getByTestId("story-viewer").getByRole("button", { name: "Fermer", exact: true }).click();
  await p.context().close();
});

test("« à la une » du club : une collection par nom, l'épinglée d'abord ; l'admin épingle une autre", async ({ browser }) => {
  const p = await login(browser, "admin_lyon");
  await p.goto(`/clubs/${lyonId}`);
  const wall = p.getByTestId("club-wall");
  await expect(wall.getByRole("heading", { name: "À la une" })).toBeVisible();
  const names = wall.getByTestId("wall-collection-name");
  await expect(names).toHaveText(["Interclubs de la saison", "Soirée du club"]);
  await expect(wall.getByTestId("wall-collection").first()).toHaveAttribute("data-pinned", "true");
  // Ouvrir une collection : ses stories se lisent en plein écran, avec les commandes de l'admin.
  await wall.getByRole("button", { name: "Collection Soirée du club" }).click();
  const viewer = p.getByTestId("story-viewer");
  await expect(viewer.getByTestId("story-title")).toHaveText("Soirée du club");
  await expect(viewer.getByTestId("story-text")).toContainText("Soirée du club vendredi");
  await viewer.getByRole("button", { name: "Épingler en premier" }).click();
  await viewer.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(names).toHaveText(["Soirée du club", "Interclubs de la saison"]);
  await expect(wall.locator('[data-pinned="true"]')).toHaveCount(1);
  await p.context().close();
});

test("membre simple : voit les collections de la une et les lit, sans aucune commande d'admin", async ({ browser }) => {
  const p = await login(browser, "parieur4");
  await p.goto(`/clubs/${lyonId}`);
  const wall = p.getByTestId("club-wall");
  await expect(wall.getByTestId("wall-collection")).toHaveCount(2);
  await wall.getByRole("button", { name: /Collection Interclubs de la saison/ }).click();
  const viewer = p.getByTestId("story-viewer");
  await expect(viewer.getByTestId("story-text")).toContainText("Interclubs samedi");
  await expect(viewer.getByTestId("collection-controls")).toHaveCount(0);
  await expect(viewer.getByRole("button", { name: "Ajouter à la une" })).toHaveCount(0);
  await expect(viewer.getByRole("button", { name: "Supprimer" })).toHaveCount(0);
  await viewer.getByRole("button", { name: "Fermer", exact: true }).click();
  await p.context().close();
});

test("capitaine : story d'équipe seulement, pas de choix de la une ; mot interdit refusé", async ({ browser }) => {
  const p = await login(browser, "capitaine_lyon");
  await p.goto("/");
  await p.getByTestId("story-add").click();
  const composer = p.getByTestId("story-composer");
  await expect(composer.getByLabel("Aussi à la une du club")).toHaveCount(0);
  await composer.getByLabel("Ton message").fill("Faites vos paris pour samedi");
  await composer.getByRole("button", { name: "Aperçu" }).click();
  await expect(composer.getByTestId("story-preview")).toContainText("Publier pour l'équipe Messieurs 1 de TC Démo-Lyon ?");
  await composer.getByRole("button", { name: "Publier" }).click();
  await expect(composer.getByText(/mot interdit/)).toBeVisible();
  await expect(composer.getByLabel("Ton message")).toBeVisible(); // retour à la saisie
  await composer.getByLabel("Ton message").fill("Rendez-vous 12 h 30 pour l'échauffement.");
  await composer.getByRole("button", { name: "Aperçu" }).click();
  await composer.getByRole("button", { name: "Publier" }).click();
  await expect(composer).toBeHidden();
  await p.context().close();
});

test("suppression : l'auteur supprime sa story, elle disparaît pour les membres", async ({ browser }) => {
  const cap = await login(browser, "capitaine_lyon");
  await cap.goto("/");
  await cap.getByRole("button", { name: /Stories de TC Démo-Lyon · Messieurs 1/ }).click();
  const viewer = cap.getByTestId("story-viewer");
  // Les stories d'une équipe sont rangées de la plus ancienne à la plus récente : on va à la dernière.
  while (await viewer.getByRole("button", { name: "Story suivante" }).isVisible()) await viewer.getByRole("button", { name: "Story suivante" }).click();
  await expect(viewer.getByTestId("story-text")).toContainText("Rendez-vous 12 h 30");
  await viewer.getByRole("button", { name: "Supprimer" }).click();
  await expect(viewer).toBeHidden();
  const member = await login(browser, "parieur4");
  await member.goto("/");
  await member.getByRole("button", { name: /Stories de TC Démo-Lyon · Messieurs 1/ }).click();
  await expect(member.getByTestId("story-viewer").getByTestId("story-text")).not.toContainText("Rendez-vous 12 h 30");
  const rows = await queryTestDb<{ n: string }>(`SELECT count(*)::text AS n FROM "Story" WHERE body LIKE 'Rendez-vous 12 h 30%' AND "deletedAt" IS NOT NULL`);
  expect(Number(rows[0]!.n)).toBe(1);
  await cap.context().close();
  await member.context().close();
});

test("admin : ajoute une story existante à une nouvelle collection, la retire, puis supprime une collection", async ({ browser }) => {
  const collections = (p: Page) => p.getByTestId("wall-collection");
  const admin = await login(browser, "admin_lyon");
  await admin.goto("/");
  await admin.getByRole("button", { name: /Stories de TC Démo-Lyon · Messieurs 1/ }).click();
  const viewer = admin.getByTestId("story-viewer");
  await expect(viewer.getByTestId("story-text")).toContainText("Messieurs 1 : composition confirmée");
  await viewer.getByRole("button", { name: "Ajouter à la une" }).click();
  await viewer.getByLabel("Collection à la une").selectOption({ label: "Nouvelle collection…" });
  const add = viewer.getByRole("button", { name: "Ajouter", exact: true });
  await expect(add).toBeDisabled(); // le nom est obligatoire
  await viewer.getByLabel("Nom de la collection").fill("Compositions");
  await add.click();
  await expect(viewer.getByTestId("story-on-wall")).toContainText("Compositions");
  await viewer.getByRole("button", { name: "Fermer", exact: true }).click();
  await admin.goto(`/clubs/${lyonId}`);
  await expect(collections(admin)).toHaveCount(3);
  await expect(admin.getByTestId("club-wall").getByTestId("wall-collection-name").filter({ hasText: "Compositions" })).toBeVisible();
  // Retrait depuis le lecteur : la story reste, la collection (vide) disparaît de la une.
  await admin.goto("/");
  await admin.getByRole("button", { name: /Stories de TC Démo-Lyon · Messieurs 1/ }).click();
  await viewer.getByRole("button", { name: "Retirer de la une" }).click();
  await expect(viewer.getByRole("button", { name: "Ajouter à la une" })).toBeVisible();
  await viewer.getByRole("button", { name: "Fermer", exact: true }).click();
  await admin.goto(`/clubs/${lyonId}`);
  await expect(collections(admin)).toHaveCount(2);
  // Ajout dans une collection existante, puis suppression de la collection : les stories ne sont pas supprimées.
  await admin.goto("/");
  await admin.getByRole("button", { name: /Stories de TC Démo-Lyon · Messieurs 1/ }).click();
  await viewer.getByRole("button", { name: "Ajouter à la une" }).click();
  await viewer.getByLabel("Collection à la une").selectOption({ label: "Interclubs de la saison" });
  await viewer.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(viewer.getByTestId("story-on-wall")).toContainText("Interclubs de la saison");
  await viewer.getByRole("button", { name: "Fermer", exact: true }).click();
  await admin.goto(`/clubs/${lyonId}`);
  await admin.getByRole("button", { name: /Collection Interclubs de la saison/ }).click();
  await expect(admin.getByTestId("story-viewer").locator("span.h-1")).toHaveCount(2);
  await admin.getByTestId("story-viewer").getByRole("button", { name: "Supprimer la collection" }).click();
  await expect(admin.getByTestId("story-viewer")).toBeHidden();
  await expect(collections(admin)).toHaveCount(1);
  const rows = await queryTestDb<{ n: string }>(`SELECT count(*)::text AS n FROM "Story" WHERE body LIKE 'Messieurs 1 : composition%' AND "deletedAt" IS NULL`);
  expect(Number(rows[0]!.n)).toBe(1);
  // Un capitaine (non admin) ne voit pas le bouton.
  const cap = await login(browser, "capitaine_lyon");
  await cap.goto("/");
  await cap.getByRole("button", { name: /Stories de TC Démo-Lyon · Messieurs 1/ }).click();
  await expect(cap.getByTestId("story-viewer").getByTestId("story-card")).toBeVisible();
  await expect(cap.getByRole("button", { name: "Ajouter à la une" })).toHaveCount(0);
  await admin.context().close();
  await cap.context().close();
});
