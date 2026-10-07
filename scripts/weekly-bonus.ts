// Déclenchement manuel du bonus du lundi (dev et dépannage). Usage : npm run weekly-bonus
// Idempotent : le relancer la même semaine ne crédite personne une seconde fois.
import "dotenv/config";
import { db } from "@/lib/db";
import { grantWeeklyBonus } from "@/server/weekly-bonus";

async function main() {
  const { week, granted } = await grantWeeklyBonus();
  console.log(`Semaine ${week} : ${granted} compte(s) crédité(s).`);
  await db.$disconnect();
}

void main();
