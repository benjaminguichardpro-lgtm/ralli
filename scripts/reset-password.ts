// Dépannage pendant le pilote (pas d'email, donc pas de « mot de passe oublié » en libre-service).
// Usage : npm run reset-password -- <email>
// Affiche un mot de passe temporaire à transmettre à la personne par un canal sûr.
// Il devra être changé à la connexion suivante.
import "dotenv/config";
import { emailSchema } from "@/lib/validation/account";
import { db } from "@/lib/db";
import { resetPasswordByEmail } from "@/server/accounts";
import { DomainError } from "@/server/errors";

async function main() {
  const arg = process.argv[2];
  const parsed = emailSchema.safeParse(arg);
  if (!parsed.success) {
    console.error("Usage : npm run reset-password -- <email>");
    process.exit(2);
  }
  try {
    const { temporaryPassword, displayName } = await resetPasswordByEmail(parsed.data);
    console.log(`Compte : ${displayName} <${parsed.data}>`);
    console.log(`Mot de passe temporaire : ${temporaryPassword}`);
    console.log("À changer obligatoirement à la prochaine connexion.");
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
