// Prouve en base réelle que le trigger du ledger et les contraintes CHECK fonctionnent.
// Tout se passe dans une transaction annulée à la fin : aucune donnée ne reste en base.
// Usage : npm run db:verify   (utilise DIRECT_URL du .env)
import "dotenv/config";
import { Client } from "pg";

type Check = { label: string; sql: string; params?: unknown[]; expect: "ok" | "error" };

const checks: Check[] = [
  {
    label: "INSERT écriture de ledger valide (SIGNUP_BONUS +1000)",
    sql: `INSERT INTO "LedgerEntry"(id,"userId",type,amount,"idempotencyKey") VALUES ('verif_le2','verif_u','SIGNUP_BONUS',1000,'verif:signup2')`,
    expect: "ok",
  },
  { label: "UPDATE sur LedgerEntry", sql: `UPDATE "LedgerEntry" SET amount = 999999 WHERE id = 'verif_le'`, expect: "error" },
  { label: "DELETE sur LedgerEntry", sql: `DELETE FROM "LedgerEntry" WHERE id = 'verif_le'`, expect: "error" },
  {
    label: "INSERT Prediction avec committedAces = 5",
    sql: `INSERT INTO "Prediction"(id,"userId","matchId","pickedSide","committedAces","oddsX100") VALUES ('verif_p5','verif_u','verif_m','HOME',5,150)`,
    expect: "error",
  },
  {
    label: "INSERT Prediction avec committedAces = 10 (minimum autorisé)",
    sql: `INSERT INTO "Prediction"(id,"userId","matchId","pickedSide","committedAces","oddsX100") VALUES ('verif_p10','verif_u','verif_m','HOME',10,150)`,
    expect: "ok",
  },
  {
    label: "INSERT Prediction avec oddsX100 = 99",
    sql: `INSERT INTO "Prediction"(id,"userId","matchId","pickedSide","committedAces","oddsX100") VALUES ('verif_p99','verif_u2','verif_m','HOME',10,99)`,
    expect: "error",
  },
  {
    label: "INSERT Prediction avec oddsX100 = 1001",
    sql: `INSERT INTO "Prediction"(id,"userId","matchId","pickedSide","committedAces","oddsX100") VALUES ('verif_p1001','verif_u2','verif_m','HOME',10,1001)`,
    expect: "error",
  },
  {
    label: "INSERT ledger PREDICTION_COMMIT avec montant positif (+10)",
    sql: `INSERT INTO "LedgerEntry"(id,"userId",type,amount,"idempotencyKey") VALUES ('verif_c1','verif_u','PREDICTION_COMMIT',10,'verif:c1')`,
    expect: "error",
  },
  {
    label: "INSERT ledger PREDICTION_COMMIT avec montant négatif (-10)",
    sql: `INSERT INTO "LedgerEntry"(id,"userId",type,amount,"idempotencyKey") VALUES ('verif_c2','verif_u','PREDICTION_COMMIT',-10,'verif:c2')`,
    expect: "ok",
  },
  {
    label: "INSERT ledger WEEKLY_BONUS avec montant négatif (-200)",
    sql: `INSERT INTO "LedgerEntry"(id,"userId",type,amount,"idempotencyKey") VALUES ('verif_w1','verif_u','WEEKLY_BONUS',-200,'verif:w1')`,
    expect: "error",
  },
  {
    label: "INSERT ledger DAILY_LOGIN_BONUS valide (+10)",
    sql: `INSERT INTO "LedgerEntry"(id,"userId",type,amount,"idempotencyKey") VALUES ('verif_d1','verif_u','DAILY_LOGIN_BONUS',10,'verif:daily:1')`,
    expect: "ok",
  },
  {
    label: "INSERT ledger STREAK_BONUS valide (+50)",
    sql: `INSERT INTO "LedgerEntry"(id,"userId",type,amount,"idempotencyKey") VALUES ('verif_s1','verif_u','STREAK_BONUS',50,'verif:streak:1')`,
    expect: "ok",
  },
  {
    label: "INSERT ledger DAILY_LOGIN_BONUS avec montant négatif (-10)",
    sql: `INSERT INTO "LedgerEntry"(id,"userId",type,amount,"idempotencyKey") VALUES ('verif_d2','verif_u','DAILY_LOGIN_BONUS',-10,'verif:daily:2')`,
    expect: "error",
  },
  {
    label: "INSERT ledger STREAK_BONUS avec montant nul (0)",
    sql: `INSERT INTO "LedgerEntry"(id,"userId",type,amount,"idempotencyKey") VALUES ('verif_s2','verif_u','STREAK_BONUS',0,'verif:streak:2')`,
    expect: "error",
  },
  {
    label: "INSERT ledger PREDICTION_PAYOUT avec montant nul (0)",
    sql: `INSERT INTO "LedgerEntry"(id,"userId",type,amount,"idempotencyKey") VALUES ('verif_po','verif_u','PREDICTION_PAYOUT',0,'verif:po')`,
    expect: "error",
  },
  { label: "TRUNCATE LedgerEntry (autorisé pour réinitialiser la base de test)", sql: `TRUNCATE "LedgerEntry"`, expect: "ok" },
];

// Données minimales pour satisfaire les clés étrangères (club → équipes → joueurs → rencontre → match).
const fixtures = `
INSERT INTO "User"(id,email,"passwordHash","displayName","displayNameKey","ageConfirmedAt") VALUES
  ('verif_u','verif@ralli.test','x','Verif','verif',now()),
  ('verif_u2','verif2@ralli.test','x','Verif2','verif2',now());
INSERT INTO "Club"(id,name,"inviteCode","createdById") VALUES ('verif_c','Club vérif','VERIF1','verif_u');
INSERT INTO "Team"(id,"clubId",name) VALUES ('verif_t1','verif_c','Équipe A'),('verif_t2','verif_c','Équipe B');
INSERT INTO "Player"(id,"clubId","firstName","lastName","fftRank") VALUES
  ('verif_pl1','verif_c','A','A','R30'),('verif_pl2','verif_c','B','B','R15');
INSERT INTO "Encounter"(id,"organizerClubId","homeTeamId","awayTeamId","startsAt","predictionsCloseAt","createdById","updatedAt")
  VALUES ('verif_e','verif_c','verif_t1','verif_t2',now(),now(),'verif_u',now());
INSERT INTO "Match"(id,"encounterId","order","homePlayerId","awayPlayerId") VALUES ('verif_m','verif_e',1,'verif_pl1','verif_pl2');
INSERT INTO "LedgerEntry"(id,"userId",type,amount,"idempotencyKey") VALUES ('verif_le','verif_u','SIGNUP_BONUS',1000,'verif:signup');
`;

async function main() {
  const url = process.env.DIRECT_URL;
  if (!url) throw new Error("DIRECT_URL manquante dans .env");
  const client = new Client({ connectionString: url });
  await client.connect();
  let failures = 0;
  try {
    await client.query("BEGIN");
    await client.query(fixtures);
    for (const [i, c] of checks.entries()) {
      const sp = `sp${i}`;
      await client.query(`SAVEPOINT ${sp}`);
      let outcome: "ok" | "error";
      let detail: string;
      try {
        const r = await client.query(c.sql, c.params as unknown[] | undefined);
        outcome = "ok";
        detail = `${r.command} ${r.rowCount ?? ""}`.trim();
        await client.query(`RELEASE SAVEPOINT ${sp}`);
      } catch (e) {
        outcome = "error";
        const err = e as { code?: string; message?: string; constraint?: string };
        detail = `[${err.code}] ${err.message}${err.constraint ? ` (contrainte ${err.constraint})` : ""}`;
        await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
      }
      const pass = outcome === c.expect;
      if (!pass) failures++;
      console.log(`${pass ? "PASS" : "FAIL"}  attendu=${c.expect.padEnd(5)} obtenu=${outcome.padEnd(5)} ${c.label}\n      → ${detail}`);
    }
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
  console.log(`\n${checks.length - failures}/${checks.length} vérifications conformes. Transaction annulée, aucune donnée conservée.`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
