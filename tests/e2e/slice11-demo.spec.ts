import { type Browser, type Page, expect, test } from "@playwright/test";
import { checkPage, queryTestDb, seedDemoOnTestDb, signIn, wipeTestDb } from "./helpers";

// Charge la vraie démo (`npm run seed:demo`) dans la base de test et parcourt ses écrans au format téléphone.

test.describe.configure({ mode: "serial" });

const PASSWORD = "demo-ralli-2026";
let clubId: string;
const ids: Record<"open" | "locked" | "proposed" | "disputed" | "cancelled" | "draft" | "confirmed", string> = {} as never;

const newPage = async (b: Browser) => (await b.newContext()).newPage();

async function login(b: Browser, pseudo: string): Promise<Page> {
  const page = await newPage(b);
  await signIn(page, pseudo, PASSWORD, pseudo);
  await expect(page.getByTestId("nav-user")).toHaveText(pseudo);
  // Les comptes de démo sont « anciens » : la popup de connexion quotidienne apparaît à la première ouverture.
  const popup = page.getByTestId("daily-bonus");
  if (await popup.isVisible().catch(() => false)) await popup.getByRole("button", { name: "Super" }).click();
  return page;
}

test.beforeAll(async () => {
  test.setTimeout(300_000);
  seedDemoOnTestDb();
  const rows = await queryTestDb<{ id: string; status: string; started: boolean; settled: Date | null }>(
    `SELECT e.id, e.status, e."startsAt" < now() AS started, e."settledAt" AS settled
       FROM "Encounter" e JOIN "Club" c ON c.id = e."organizerClubId"
      WHERE c.name = 'TC Démo-Lyon' ORDER BY e."startsAt" DESC`,
  );
  const pick = (f: (r: (typeof rows)[number]) => boolean) => rows.find(f)!.id;
  ids.open = pick((r) => r.status === "OPEN" && !r.started);
  ids.locked = pick((r) => r.status === "OPEN" && r.started);
  ids.proposed = pick((r) => r.status === "SCORE_PROPOSED");
  ids.disputed = pick((r) => r.status === "DISPUTED");
  ids.cancelled = pick((r) => r.status === "CANCELLED");
  ids.draft = pick((r) => r.status === "DRAFT");
  ids.confirmed = pick((r) => r.status === "CONFIRMED");
  clubId = (await queryTestDb<{ id: string }>(`SELECT id FROM "Club" WHERE name = 'TC Démo-Lyon'`))[0]!.id;
});

test.afterAll(async () => {
  await wipeTestDb();
});

test("parieur1 : popup de connexion quotidienne, puis accueil avec la prochaine rencontre", async ({ browser }) => {
  const page = await newPage(browser);
  await signIn(page, "parieur1", PASSWORD, "parieur1");
  await expect(page.getByTestId("daily-position")).toHaveText("1/7");
  await page.getByTestId("daily-bonus").getByRole("button", { name: "Super" }).click();
  await page.goto("/");
  await expect(page.getByTestId("next-encounter")).toBeVisible();
  await expect(page.getByTestId("feed")).toContainText("TC Démo-Lyon");
  await checkPage(page, "70-demo-accueil");
});

test("parieur1 : les états d'une rencontre, de ouverte à terminée", async ({ browser }) => {
  const p = await login(browser, "parieur1");
  const open = async (id: string, shot: string) => {
    await p.goto(`/rencontres/${id}`);
    await checkPage(p, shot);
  };

  await open(ids.open, "71-demo-ouverte");
  await expect(p.getByText("Pronostics ouverts", { exact: true })).toBeVisible();
  await expect(p.getByTestId("odds").first()).toBeVisible();
  await expect(p.getByTestId("my-prediction").first()).toBeVisible();

  await open(ids.locked, "72-demo-verrouillee");
  await expect(p.getByText("Pronostics fermés", { exact: true })).toBeVisible();

  await open(ids.proposed, "73-demo-score-propose");
  await expect(p.getByText("Score proposé", { exact: true })).toBeVisible();
  await expect(p.getByTestId("score-pending")).toBeVisible();

  await open(ids.disputed, "74-demo-contestee");
  await expect(p.getByText("Score contesté", { exact: true })).toBeVisible();

  await open(ids.cancelled, "75-demo-annulee");
  await expect(p.getByText("Annulée", { exact: true })).toBeVisible();

  await open(ids.confirmed, "76-demo-terminee");
  await expect(p.getByText("Terminée", { exact: true })).toBeVisible();
  await expect(p.getByTestId("results")).toBeVisible();
  await expect(p.getByTestId("my-prediction").first()).toContainText(/Gagné|Perdu/);

  // Un brouillon n'est pas visible d'un simple membre.
  await p.goto(`/rencontres/${ids.draft}`);
  await p.waitForLoadState("networkidle");
  await expect(p.getByText("Brouillon", { exact: true })).toHaveCount(0);
  await expect(p.locator("main")).not.toContainText("TC Bron 1");
});

test("parieur1 : portefeuille et classements (saison et semaine) bien remplis", async ({ browser }) => {
  const p = await login(browser, "parieur1");
  await p.goto("/portefeuille");
  await expect(p.getByTestId("ledger")).toContainText("Aces gagnés");
  await expect(p.getByTestId("settled").locator("li").first()).toBeVisible();
  await checkPage(p, "77-demo-portefeuille");

  await p.goto(`/clubs/${clubId}/classement`);
  const rows = p.getByTestId("leaderboard-row");
  expect(await rows.count()).toBeGreaterThanOrEqual(5);
  expect(await rows.getByTestId("avatar").count(), "un avatar par ligne").toBe(await rows.count());
  await checkPage(p, "78-demo-classement-saison");
  await p.goto(`/clubs/${clubId}/classement?periode=semaine`);
  expect(await p.getByTestId("leaderboard-row").count()).toBeGreaterThanOrEqual(1);
  await checkPage(p, "79-demo-classement-semaine");
});

test("anti-trucage : admin, capitaine et joueur lié sont bloqués sur la rencontre ouverte", async ({ browser }) => {
  const reasons: [string, string][] = [
    ["admin_lyon", "Les admins du club ne peuvent pas pronostiquer les rencontres de leur club."],
    ["capitaine_lyon", "Un capitaine ne peut pas pronostiquer la rencontre de son équipe."],
    ["joueur_lyon", "Vous êtes aligné dans cette rencontre : vous ne pouvez pas la pronostiquer."],
  ];
  for (const [pseudo, reason] of reasons) {
    const p = await login(browser, pseudo);
    await p.goto(`/rencontres/${ids.open}`);
    await expect(p.getByTestId("blocked").first()).toHaveText(reason);
    await expect(p.getByTestId("matches").getByRole("button")).toHaveCount(0);
  }
});

test("staff : confirmer/contester, arbitrer le litige, brouillon, code d'invitation", async ({ browser }) => {
  const admin = await login(browser, "admin_lyon");
  await admin.goto(`/rencontres/${ids.proposed}`);
  await expect(admin.getByRole("button", { name: "Confirmer le score" })).toBeVisible();
  await expect(admin.getByTestId("dispute-score")).toBeVisible();
  await checkPage(admin, "84-demo-staff-score-propose");

  await admin.goto(`/rencontres/${ids.disputed}`);
  await expect(admin.getByTestId("dispute-reason")).toContainText("abandon");
  await expect(admin.getByTestId("resolve-dispute")).toBeVisible();
  await checkPage(admin, "85-demo-staff-litige");

  await admin.goto(`/clubs/${clubId}`);
  await expect(admin.getByTestId("invite-code")).toBeVisible();
  await checkPage(admin, "86-demo-club-admin");

  // L'auteur de la proposition peut la retirer mais pas la confirmer ; le capitaine voit son brouillon.
  const dames = await login(browser, "capitaine_dames_lyon");
  await dames.goto(`/rencontres/${ids.proposed}`);
  await expect(dames.getByRole("button", { name: "Retirer ma proposition" })).toBeVisible();
  await expect(dames.getByRole("button", { name: "Confirmer le score" })).toHaveCount(0);
  await dames.goto(`/rencontres/${ids.draft}`);
  await expect(dames.getByText("Brouillon", { exact: true })).toBeVisible();
  await expect(dames.getByRole("button", { name: "Publier la rencontre" })).toBeVisible();
  await checkPage(dames, "87-demo-capitaine-brouillon");

  // Le club vide : son admin y trouve son code et aucune équipe.
  const bordeaux = await login(browser, "admin_bordeaux");
  await bordeaux.goto("/clubs");
  await expect(bordeaux.getByTestId("my-clubs")).toContainText("TC Démo-Bordeaux");
});
