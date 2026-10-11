import { type Browser, type Page, expect, test } from "@playwright/test";
import { checkPage, openSection, queryTestDb, seedDemoOnTestDb, signIn, wipeTestDb } from "./helpers";

// Page du club allégée : rencontres et classement d'abord ; équipes du club, équipes adverses et membres en sections repliées.
// Charge la vraie démo (TC Démo-Lyon : admin_lyon, parieur1 simple membre).

test.describe.configure({ mode: "serial" });

const PASSWORD = "demo-ralli-2026";
let clubId: string;
let teams = 0, opponents = 0, members = 0;

const newPage = async (b: Browser) => (await b.newContext()).newPage();

async function login(b: Browser, pseudo: string): Promise<Page> {
  const page = await newPage(b);
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
  clubId = (await queryTestDb<{ id: string }>(`SELECT id FROM "Club" WHERE name = 'TC Démo-Lyon'`))[0]!.id;
  const n = async (sql: string) => Number((await queryTestDb<{ n: string }>(sql, [clubId]))[0]!.n);
  teams = await n(`SELECT count(*)::text AS n FROM "Team" WHERE "clubId" = $1 AND kind = 'CLUB'`);
  opponents = await n(`SELECT count(*)::text AS n FROM "Team" WHERE "clubId" = $1 AND kind = 'EXTERNAL'`);
  members = await n(`SELECT count(*)::text AS n FROM "ClubMembership" WHERE "clubId" = $1`);
});
test.afterAll(async () => {
  await wipeTestDb();
});

const sections = (p: Page) => ({
  teams: p.getByTestId("section-teams"),
  opponents: p.getByTestId("section-opponents"),
  members: p.getByTestId("section-members"),
});

test("membre : rencontres et classement d'abord, puis trois sections repliées avec leur compteur", async ({ browser }) => {
  const p = await login(browser, "parieur1");
  await p.goto(`/clubs/${clubId}`);
  await p.getByTestId("club-header").waitFor();
  const s = sections(p);
  await expect(s.teams.locator("summary")).toHaveText(`Équipes du club (${teams})`);
  await expect(s.opponents.locator("summary")).toHaveText(`Équipes adverses (${opponents})`);
  await expect(s.members.locator("summary")).toHaveText(`Membres (${members})`);
  expect(teams).toBeGreaterThan(0);
  expect(opponents).toBeGreaterThan(0);
  expect(members).toBeGreaterThan(1);
  for (const sec of [s.teams, s.opponents, s.members]) await expect(sec).not.toHaveAttribute("open", "");
  // Fermées : leur contenu n'est pas affiché.
  await expect(s.teams.getByRole("link").first()).toBeHidden();
  await expect(s.opponents.getByRole("link").first()).toBeHidden();
  // Ordre : rencontres (ou son écran vide) et classement avant les sections repliées.
  const y = async (loc: ReturnType<Page["getByTestId"]>) => (await loc.boundingBox())!.y;
  expect(await y(p.getByTestId("club-top3"))).toBeLessThan(await y(s.teams));
  expect(await y(s.teams)).toBeLessThan(await y(s.opponents));
  expect(await y(s.opponents)).toBeLessThan(await y(s.members));
  // Un simple membre n'a ni code d'invitation ni formulaire de création.
  await expect(p.getByTestId("invite-code")).toHaveCount(0);
  await openSection(p, "Équipes du club");
  await expect(p.getByText("Créer une équipe")).toHaveCount(0);
  await checkPage(p, "230-club-membre-replie");
});

test("membre : ouvrir une section montre son contenu, une équipe mène à sa page", async ({ browser }) => {
  const p = await login(browser, "parieur1");
  await p.goto(`/clubs/${clubId}`);
  await openSection(p, "Équipes du club");
  await expect(sections(p).teams.getByRole("link")).toHaveCount(teams);
  await openSection(p, "Équipes adverses");
  await expect(sections(p).opponents.getByRole("link")).toHaveCount(opponents);
  await openSection(p, "Membres");
  await expect(sections(p).members.locator("li")).toHaveCount(members);
  await checkPage(p, "231-club-membre-deplie");
  await sections(p).teams.getByRole("link").first().click();
  await expect(p).toHaveURL(/\/equipes\//);
});

test("admin : code d'invitation raccourci, formulaires de création cachés tant que la section est repliée", async ({ browser }) => {
  const a = await login(browser, "admin_lyon");
  await a.goto(`/clubs/${clubId}`);
  await a.getByTestId("club-header").waitFor();
  await expect(a.getByRole("button", { name: "Révéler le code d'invitation" })).toBeVisible();
  await expect(a.getByText("Le lien contient le code : envoie-le seulement aux personnes que tu invites.")).toBeVisible();
  await expect(a.getByText(/À communiquer aux membres, joueurs et proches/)).toHaveCount(0);
  await expect(a.getByText("Créer une équipe")).toBeHidden();
  await expect(a.getByText("Ajouter une équipe adverse")).toBeHidden();
  await expect(a.getByRole("button", { name: /Nommer admin|Retirer le rôle admin/ }).first()).toBeHidden();
  await openSection(a, "Équipes du club");
  await expect(a.getByText("Créer une équipe")).toBeVisible();
  await openSection(a, "Équipes adverses");
  await expect(a.getByText("Ajouter une équipe adverse")).toBeVisible();
  await openSection(a, "Membres");
  await expect(a.getByRole("button", { name: /Nommer admin|Retirer le rôle admin/ }).first()).toBeVisible();
  await checkPage(a, "232-club-admin-deplie");
});
