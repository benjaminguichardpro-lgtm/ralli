// Remplit la base LOCALE avec des données de démonstration (clubs, équipes, rencontres, pronostics).
// Usage : npm run seed:demo            (refuse si des comptes de démo existent déjà)
//         npm run seed:demo -- --reset (vide d'abord TOUTE la base, puis recrée la démo ; base locale seulement)
// Base distante (Neon) : refusée, sauf autorisation explicite qui nomme le serveur visé :
//         npm run seed:demo -- --base-distante=<nom exact du serveur>   (jamais combinable avec --reset)
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

function hostOf(url: string | undefined): string | null {
  try {
    return new URL(url ?? "").hostname;
  } catch {
    return null;
  }
}

async function main() {
  const reset = process.argv.includes("--reset");
  if (!isLocal(process.env.DATABASE_URL)) {
    // Base distante : il faut recopier le nom exact du serveur, pour ne pas viser la mauvaise base par accident.
    const host = hostOf(process.env.DATABASE_URL);
    const allowed = process.argv.find((a) => a.startsWith("--base-distante="))?.slice("--base-distante=".length);
    if (!host || allowed !== host) {
      console.error(
        "Refusé : la démo ne se charge que sur une base locale (localhost).\n" +
          `Pour une base distante, ajoutez l'autorisation explicite : --base-distante=${host ?? "<serveur>"}`,
      );
      process.exit(1);
    }
    if (reset) {
      console.error("Refusé : --reset (qui vide toute la base) n'est autorisé que sur une base locale.");
      process.exit(1);
    }
    console.log(`Base distante autorisée : ${host}`);
  }
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
  console.log("\nClubs (à chercher dans l'onglet Clubs) :");
  for (const c of s.clubs) console.log(`  ${c.name.padEnd(20)} /clubs/${c.id}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
