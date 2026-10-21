import { type Browser, type Page, expect, test } from "@playwright/test";
import { checkPage, joinClubById, queryTestDb, seedDemoOnTestDb, signIn, signUp, wipeTestDb } from "./helpers";

// Animation de l'app, comparée à la base avec la vraie démo : compteur « membres qui ont pronostiqué », marqueur « Nouveau »
// et pastille de l'onglet « Mes rallis », classement vivant (mouvement de place, leader de la semaine), animations et série d'affilée.

test.describe.configure({ mode: "serial" });

const PASSWORD = "demo-ralli-2026";
const newPage = async (b: Browser) => (await b.newContext()).newPage();

let clubId: string, openId: string, confirmedId: string;

async function login(b: Browser, pseudo: string, closePopups = true): Promise<Page> {
  const page = await newPage(b);
  await signIn(page, pseudo, PASSWORD, pseudo);
  await expect(page.getByTestId("nav-user")).toHaveText(pseudo);
  if (closePopups) {
    const popup = page.getByTestId("daily-bonus");
    if (await popup.waitFor({ timeout: 5000 }).then(() => true, () => false)) await popup.getByRole("button", { name: "Super" }).click();
    await expect(popup).toBeHidden();
  }
  return page;
}

test.beforeAll(async () => {
  test.setTimeout(300_000);
  seedDemoOnTestDb();
  const club = (await queryTestDb<{ id: string }>(`SELECT id FROM "Club" WHERE name = 'TC Démo-Lyon'`))[0]!;
  clubId = club.id;
  const rows = await queryTestDb<{ id: string; status: string; started: boolean }>(
    `SELECT e.id, e.status, e."startsAt" < now() AS started FROM "Encounter" e WHERE e."organizerClubId" = $1 ORDER BY e."startsAt" DESC`,
    [clubId],
  );
  openId = rows.find((r) => r.status === "OPEN" && !r.started)!.id;
  confirmedId = rows.find((r) => r.status === "CONFIRMED")!.id;
});
test.afterAll(async () => {
  await wipeTestDb();
});

// ───────────── Point 2 : « X membres ont pronostiqué », sur chaque match ─────────────

async function expectedCounts(encounterId: string): Promise<number[]> {
  const rows = await queryTestDb<{ n: string }>(
    `SELECT count(p.id)::text AS n FROM "Match" m LEFT JOIN "Prediction" p ON p."matchId" = m.id AND p.status IN ('PENDING','WON','LOST')
      WHERE m."encounterId" = $1 AND m."voidedAt" IS NULL GROUP BY m.id, m.kind, m."order" ORDER BY m.kind, m."order"`,
    [encounterId],
  );
  return rows.map((r) => Number(r.n));
}
const label = (n: number) => (n === 0 ? null : n === 1 ? "1 membre a pronostiqué" : `${n} membres ont pronostiqué`);

async function expectCountsOnPage(p: Page, encounterId: string) {
  await p.goto(`/rencontres/${encounterId}`);
  await p.getByTestId("matches").waitFor();
  const expected = await expectedCounts(encounterId);
  expect(expected.some((n) => n > 0), "la démo a des rallis sur cette rencontre").toBe(true);
  const items = p.getByTestId("matches").locator("> li");
  await expect(items).toHaveCount(expected.length);
  for (let i = 0; i < expected.length; i++) {
    const line = items.nth(i).getByTestId("predictor-count");
    const text = label(expected[i]!);
    if (text) await expect(line).toHaveText(text);
    else await expect(line).toHaveCount(0);
  }
}

test("compteur de rallis : exact sur chaque match, pour un membre, un admin (qui ne peut pas pronostiquer) et un visiteur", async ({ browser }) => {
  const member = await login(browser, "parieur1");
  await expectCountsOnPage(member, openId);
  await checkPage(member, "240-compteur-rallis");
  await expectCountsOnPage(member, confirmedId); // il reste affiché après le score
  const admin = await login(browser, "admin_lyon");
  await expectCountsOnPage(admin, openId);
  const visitor = await newPage(browser);
  await expectCountsOnPage(visitor, openId); // la page est publique : le nombre aussi, jamais les noms
  const text = await visitor.getByTestId("matches").innerText();
  expect(text).not.toMatch(/parieur\d/);
});

// ───────────── Point 3 : marqueur « Nouveau », éclat doré, pastille sur l'onglet ─────────────

test("rallis réglés depuis moins de 48 h : marqueur « Nouveau » et éclat doré sur les gagnés, comme dans la base", async ({ browser }) => {
  const p = await login(browser, "parieur1");
  await p.goto("/rallis");
  await p.getByTestId("results-list").waitFor();
  const rows = await queryTestDb<{ recent: boolean; won: boolean }>(
    `SELECT (p."settledAt" > now() - interval '48 hours') AS recent, (p.status = 'WON') AS won
       FROM "Prediction" p JOIN "User" u ON u.id = p."userId"
      WHERE u."displayName" = 'parieur1' AND p.status IN ('WON','LOST','REFUNDED') AND p."settledAt" IS NOT NULL
      ORDER BY p."settledAt" DESC, p.id DESC LIMIT 20`,
  );
  const recent = rows.filter((r) => r.recent);
  expect(recent.length, "la démo a une rencontre réglée il y a quelques heures").toBeGreaterThan(0);
  expect(recent.length, "et des rallis plus anciens").toBeLessThan(rows.length);
  await expect(p.getByTestId("new-tag")).toHaveCount(recent.length);
  await expect(p.locator('[data-testid="result-item"][data-recent="true"]')).toHaveCount(recent.length);
  await expect(p.locator("li.won-new")).toHaveCount(recent.filter((r) => r.won).length);
  // Le marqueur n'est jamais sur un ralli ancien.
  await expect(p.locator('[data-testid="result-item"]:not([data-recent="true"]) [data-testid="new-tag"]')).toHaveCount(0);
  await checkPage(p, "241-mes-rallis-nouveau");
});

test("éclat doré : coupé avec « réduire les animations »", async ({ browser }) => {
  const p = await login(browser, "parieur1");
  await p.emulateMedia({ reducedMotion: "no-preference" });
  await p.goto("/rallis");
  await p.getByTestId("results-list").waitFor();
  const won = p.locator("li.won-new").first();
  await expect(won).toBeAttached();
  expect(await won.evaluate((e) => getComputedStyle(e).animationName)).toBe("won-shine");
  await p.emulateMedia({ reducedMotion: "reduce" });
  expect(await won.evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
});

test("pastille sur l'onglet « Mes rallis » : visible quand des résultats n'ont pas été vus, disparaît à la fermeture de la popup", async ({ browser }) => {
  // On fait « oublier » à un compte ses résultats : la popup de résultats s'ouvre à la connexion, et la pastille est là.
  await queryTestDb(`UPDATE "User" SET "resultsSeenAt" = now() - interval '60 days' WHERE "displayName" = 'parieur2'`);
  const p = await login(browser, "parieur2", false);
  const recap = p.getByTestId("results-recap");
  await expect(recap).toBeVisible();
  const badge = p.getByTestId("badge-rallis");
  await expect(badge).toHaveAttribute("aria-label", "Nouveaux résultats");
  await recap.getByRole("button").last().click();
  await expect(recap).toBeHidden();
  await expect(badge).toHaveCount(0);
  await p.reload();
  await expect(p.getByTestId("badge-rallis")).toHaveCount(0); // vu : plus de pastille
  // Un compte à jour n'a pas de pastille.
  const q = await login(browser, "parieur3");
  await expect(q.getByTestId("badge-rallis")).toHaveCount(0);
  // La popup, elle, n'a pas changé : un compte neuf n'a ni popup ni pastille.
});

// ───────────── Point 4 : classement vivant ─────────────

type Tot = { name: string; net: number; settled: number };
const rankOf = (tot: Tot[], min: number): Map<string, number> => {
  const ok = tot.filter((t) => t.settled >= min);
  return new Map(ok.map((t) => [t.name, 1 + ok.filter((q) => q.net > t.net).length]));
};
async function totals(sinceSql: string, untilSql: string): Promise<Tot[]> {
  const rows = await queryTestDb<{ name: string; net: string; settled: string }>(
    // Interclubs confirmés et matchs de tournoi réglés du club comptent de la même façon (comme `clubTotals`).
    `SELECT t.name, sum(t.net)::text AS net, count(*)::text AS settled FROM (
       SELECT u."displayName" AS name, coalesce(p."payoutAces",0) - p."committedAces" AS net
         FROM "Prediction" p JOIN "User" u ON u.id = p."userId" JOIN "Match" m ON m.id = p."matchId" JOIN "Encounter" e ON e.id = m."encounterId"
        WHERE p.status IN ('WON','LOST') AND e."organizerClubId" = $1 AND e.status = 'CONFIRMED' AND e."settledAt" >= ${sinceSql} AND e."settledAt" < ${untilSql}
       UNION ALL
       SELECT u."displayName" AS name, coalesce(p."payoutAces",0) - p."committedAces" AS net
         FROM "Prediction" p JOIN "User" u ON u.id = p."userId" JOIN "TournamentMatch" tm ON tm.id = p."tournamentMatchId" JOIN "Tournament" tn ON tn.id = tm."tournamentId"
        WHERE p.status IN ('WON','LOST') AND tn."clubId" = $1 AND tm."settledAt" >= ${sinceSql} AND tm."settledAt" < ${untilSql}
     ) t GROUP BY t.name`,
    [clubId],
  );
  return rows.map((r) => ({ name: r.name, net: Number(r.net), settled: Number(r.settled) }));
}
const SEASON_FROM = `(timestamp '2026-09-01 00:00' AT TIME ZONE 'Europe/Paris')`;
const SEASON_TO = `(timestamp '2027-09-01 00:00' AT TIME ZONE 'Europe/Paris')`;
const WEEK_FROM = `(date_trunc('week', now() AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'Europe/Paris')`;

test("leader de la semaine : affiché avec le bon nom, comme dans la base ; mouvement de place depuis lundi correct", async ({ browser }) => {
  const week = await totals(WEEK_FROM, SEASON_TO);
  const best = Math.max(...week.filter((t) => t.settled >= 1).map((t) => t.net));
  expect(best, "la démo a une rencontre réglée cette semaine, avec un gagnant").toBeGreaterThan(0);
  const leaders = week.filter((t) => t.settled >= 1 && t.net === best).map((t) => t.name).sort();

  const p = await login(browser, "parieur1");
  await p.goto(`/clubs/${clubId}/classement`);
  const banner = p.getByTestId("week-leader");
  await expect(banner).toBeVisible();
  const shown = (await p.getByTestId("week-leader-names").innerText()).split(" et ").sort();
  expect(shown).toEqual(leaders);
  await expect(banner).toContainText("Leader de la semaine");
  await expect(banner).toContainText(`${best.toLocaleString("fr-FR").replace(/\s/g, " ")}`.replace(/ | /g, " "));
  await p.getByRole("link", { name: "Cette semaine" }).click();
  await expect(p.getByTestId("week-leader")).toBeVisible(); // aussi sur le classement de la semaine

  // Mouvement de place : classement de la saison maintenant, et tel qu'il était lundi 00 h.
  const nowRank = rankOf(await totals(SEASON_FROM, SEASON_TO), 3);
  const beforeRank = rankOf(await totals(SEASON_FROM, WEEK_FROM), 3);
  await p.goto(`/clubs/${clubId}/classement`);
  for (const pseudo of ["parieur1", "parieur2", "parieur3"]) {
    const page = pseudo === "parieur1" ? p : await login(browser, pseudo);
    if (page !== p) await page.goto(`/clubs/${clubId}/classement`);
    const now = nowRank.get(pseudo);
    const move = page.getByTestId("rank-move");
    if (now === undefined) {
      await expect(move).toHaveCount(0);
      continue;
    }
    const before = beforeRank.get(pseudo);
    const expectKind = before === undefined ? "new" : now < before ? "up" : now > before ? "down" : "same";
    await expect(move).toHaveAttribute("data-move", expectKind);
    if (expectKind === "up") await expect(move).toContainText(`▲${before! - now}`);
    if (expectKind === "down") await expect(move).toContainText(`▼${now - before!}`);
    if (expectKind === "same") await expect(move).toContainText("=");
    // Une seule ligne porte le mouvement : celle du lecteur.
    await expect(page.getByTestId("rank-move")).toHaveCount(1);
  }
  await checkPage(p, "242-classement-vivant");
});

test("page du club : « Ta place » avec le mouvement ; pas de bouton de partage du classement", async ({ browser }) => {
  const p = await login(browser, "parieur1");
  await p.goto(`/clubs/${clubId}`);
  const place = p.getByTestId("my-place");
  await expect(place).toBeVisible();
  await expect(place).toContainText("Ta place");
  await expect(p.getByTestId("club-top3").getByTestId("rank-move")).toHaveCount(1);
  await expect(p.getByRole("link", { name: /Partager/ })).toHaveCount(0);
  await p.goto(`/clubs/${clubId}/classement`);
  await expect(p.getByRole("link", { name: /Partager/ })).toHaveCount(0);
});

test("compte non classé : pas de mouvement ni de « Ta place »", async ({ browser }) => {
  const p = await login(browser, "capitaine_lyon");
  await p.goto(`/clubs/${clubId}/classement`);
  await expect(p.getByTestId("rank-move")).toHaveCount(0);
  await p.goto(`/clubs/${clubId}`);
  await expect(p.getByTestId("my-place")).toHaveCount(0);
});

// ───────────── Point 5 : animations et série d'affilée ─────────────

test("série en cours : « N d'affilée » dans le bilan, à partir de 2, comme dans la base", async ({ browser }) => {
  const rows = await queryTestDb<{ status: string }>(
    `SELECT p.status FROM "Prediction" p JOIN "User" u ON u.id = p."userId"
      WHERE u."displayName" = 'parieur1' AND p.status IN ('WON','LOST','REFUNDED') AND p."settledAt" IS NOT NULL
      ORDER BY p."settledAt" DESC, p.id DESC LIMIT 50`,
  );
  let streak = 0;
  for (const r of rows) {
    if (r.status === "REFUNDED") continue;
    if (r.status !== "WON") break;
    streak++;
  }
  const p = await login(browser, "parieur1");
  await p.goto("/rallis");
  await p.getByTestId("results-summary").waitFor();
  if (streak >= 2) await expect(p.getByTestId("results-streak")).toHaveText(`${streak} d'affilée`);
  else await expect(p.getByTestId("results-streak")).toHaveCount(0);
  // Le filtre ne change pas la série.
  await p.getByTestId("result-filter-perdus").click();
  if (streak >= 2) await expect(p.getByTestId("results-streak")).toHaveText(`${streak} d'affilée`);
});

test("les cartes apparaissent en douceur ; rien d'animé avec « réduire les animations »", async ({ browser }) => {
  const p = await login(browser, "parieur1");
  await p.emulateMedia({ reducedMotion: "no-preference" });
  await p.goto(`/clubs/${clubId}`);
  const card = p.locator("main > section > *").first();
  await expect(card).toBeAttached();
  expect(await card.evaluate((e) => getComputedStyle(e).animationName)).toBe("card-in");
  await p.emulateMedia({ reducedMotion: "reduce" });
  expect(await card.evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
});

test("le solde compte jusqu'à sa nouvelle valeur après un ralli ; sans animation si « réduire les animations »", async ({ browser }) => {
  for (const reduce of [false, true]) {
    const name = reduce ? "Zoe24r" : "Zoe24";
    const p = await newPage(browser);
    await p.emulateMedia({ reducedMotion: reduce ? "reduce" : "no-preference" });
    await signUp(p, name);
    await joinClubById(p, clubId);
    await p.goto(`/rencontres/${openId}`);
    await p.getByTestId("matches").waitFor();
    const balance = p.getByTestId("balance");
    await expect(balance).toHaveAttribute("data-balance", "1000");
    // Enregistre tous les textes successifs du solde.
    await balance.evaluate((el) => {
      const seen: string[] = [el.textContent ?? ""];
      (window as unknown as { __seen: string[] }).__seen = seen;
      new MutationObserver(() => seen.push(el.textContent ?? "")).observe(el, { childList: true, characterData: true, subtree: true });
    });
    const first = p.getByTestId("matches").locator("> li").first();
    await first.getByRole("button", { name: /gagne/ }).first().click();
    const sheet = p.getByRole("dialog", { name: "Votre pronostic" });
    await sheet.getByLabel("Aces engagés").fill("200");
    await sheet.getByRole("button", { name: "Valider mon ralli" }).click();
    await expect(sheet).toBeHidden();
    await expect(balance).toHaveAttribute("data-balance", "800");
    await expect(balance).toHaveText(/^800 Aces$/); // arrive toujours à la vraie valeur
    const seen = await p.evaluate(() => (window as unknown as { __seen: string[] }).__seen);
    const distinct = new Set(seen.map((s) => s.replace(/\s/g, " ")));
    if (reduce) expect(distinct.size, `valeurs vues : ${[...distinct].join(" | ")}`).toBeLessThanOrEqual(2); // 1 000 puis 800
    else expect(distinct.size, `valeurs vues : ${[...distinct].join(" | ")}`).toBeGreaterThan(3); // elle défile
  }
});
