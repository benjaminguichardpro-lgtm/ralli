// Filet de sécurité : règle les pronostics d'une rencontre confirmée qui ne l'aurait pas été.
// Usage : npm run settle -- <identifiant de la rencontre>   (sans effet si elle est déjà réglée)
import "dotenv/config";
import { db } from "@/lib/db";
import { DomainError } from "@/server/errors";
import { settleConfirmedEncounter } from "@/server/settlement";

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error("Usage : npm run settle -- <identifiant de la rencontre>");
    process.exit(2);
  }
  try {
    const r = await settleConfirmedEncounter(id);
    const total = r.won + r.lost + r.refunded;
    console.log(total === 0 ? "Rien à régler (déjà réglée, ou aucun pronostic)." : `Réglé : ${r.won} gagné(s), ${r.lost} perdu(s), ${r.refunded} remboursé(s).`);
  } catch (e) {
    if (e instanceof DomainError) {
      console.error(e.message);
      process.exit(1);
    }
    throw e;
  } finally {
    await db.$disconnect();
  }
}

void main();
