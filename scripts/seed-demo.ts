// Remplit la base LOCALE avec des données de démonstration (clubs, équipes, rencontres, pronostics).
// Usage : npm run seed:demo            (refuse si des comptes de démo existent déjà)
//         npm run seed:demo -- --reset (vide d'abord TOUTE la base, puis recrée la démo)
import "dotenv/config";
import { db } from "@/lib/db";
import { DEMO_EMAIL_DOMAIN, inspectDatabase, seedDemo, wipeAll } from "@/server/demo-seed";

function isLocal(url: string | undefined): boolean {
  try {
    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(url ?? "").hostname);
  } catch {
    return false;
  }
}

async function main() {
  if (!isLocal(process.env.DATABASE_URL)) {
    console.error("Refusé : la démo ne se charge que sur une base locale (localhost). Jamais sur Neon ni en production.");
    process.exit(1);
  }
  const reset = process.argv.includes("--reset");
  const { demoUsers, otherUsers } = await inspectDatabase();

  if (reset) {
    if (otherUsers > 0 && !process.argv.includes("--tout-effacer")) {
      console.error(
        `Refusé : la base contient ${otherUsers} compte(s) qui ne sont pas des comptes de démo (autre que ${DEMO_EMAIL_DOMAIN}).\n` +
          "--reset vide TOUTE la base (l'historique des Aces ne peut pas être effacé ligne par ligne).\n" +
          "Si c'est bien ce que vous voulez : npm run seed:demo -- --reset --tout-effacer",
      );
      process.exit(1);
    }
    await wipeAll();
    console.log("Base vidée.");
  } else if (demoUsers > 0) {
    console.error("La démo est déjà chargée. Pour la refaire à neuf : npm run seed:demo -- --reset");
    process.exit(1);
  }

  const s = await seedDemo();
  console.log("\nDémo chargée.\n");
  console.log(`Mot de passe de tous les comptes : ${s.password}`);
  console.log("Connexion avec le pseudo ci-dessous (ou l'email pseudo" + DEMO_EMAIL_DOMAIN + ").\n");
  for (const a of s.accounts) console.log(`  ${a.pseudo.padEnd(22)} ${a.role}`);
  console.log("\nCodes d'invitation des clubs :");
  for (const c of s.clubs) console.log(`  ${c.name.padEnd(20)} ${c.inviteCode}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
