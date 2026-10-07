import { SIGNUP_BONUS_ACES } from "@/config/game";
import { generateTemporaryPassword, hashPassword, verifyPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { type SignUpInput, displayNameKey, loginLookup } from "@/lib/validation/account";
import { DomainError, isUniqueViolation } from "./errors";

const EMAIL_TAKEN = new DomainError("EMAIL_TAKEN", "Un compte existe déjà avec cet email");
const DISPLAY_NAME_TAKEN = new DomainError("DISPLAY_NAME_TAKEN", "Ce pseudo est déjà pris");

/**
 * Crée le compte et crédite le bonus d'inscription dans la même transaction.
 * L'entrée attend des données déjà validées par signUpSchema.
 */
export async function registerUser(input: SignUpInput): Promise<{ id: string }> {
  const key = displayNameKey(input.displayName);
  const [byEmail, byName] = await Promise.all([
    db.user.findUnique({ where: { email: input.email }, select: { id: true } }),
    db.user.findUnique({ where: { displayNameKey: key }, select: { id: true } }),
  ]);
  if (byEmail) throw EMAIL_TAKEN;
  if (byName) throw DISPLAY_NAME_TAKEN;

  const passwordHash = await hashPassword(input.password);
  try {
    return await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          displayName: input.displayName,
          displayNameKey: key,
          passwordHash,
          ageConfirmedAt: new Date(),
        },
        select: { id: true },
      });
      await tx.ledgerEntry.create({
        data: {
          userId: user.id,
          type: "SIGNUP_BONUS",
          amount: SIGNUP_BONUS_ACES,
          idempotencyKey: `signup:${user.id}`,
        },
      });
      return user;
    });
  } catch (e) {
    // Course entre deux inscriptions simultanées : la contrainte d'unicité tranche.
    if (isUniqueViolation(e, "email")) throw EMAIL_TAKEN;
    if (isUniqueViolation(e, "displayNameKey")) throw DISPLAY_NAME_TAKEN;
    throw e;
  }
}

// Hash factice (même coût bcrypt) pour que la durée de réponse ne révèle pas si l'email existe.
let dummyHash: Promise<string> | undefined;

/**
 * Vérifie les identifiants : `identifier` est un email ou un pseudo (insensible à la casse).
 * Renvoie null sans préciser lequel est faux, avec le même coût de calcul dans tous les cas.
 */
export async function authenticate(identifier: string, password: string): Promise<{ id: string } | null> {
  const where = loginLookup(identifier);
  const user = where ? await db.user.findUnique({ where, select: { id: true, passwordHash: true } }) : null;
  const ok = await verifyPassword(password, user?.passwordHash ?? (await (dummyHash ??= hashPassword("ralli-dummy"))));
  return user && ok ? { id: user.id } : null;
}

export async function changePassword(userId: string, newPassword: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false },
  });
}

/** Dépannage opérateur (pas d'email) : pose un mot de passe temporaire à changer à la prochaine connexion. */
export async function resetPasswordByEmail(email: string): Promise<{ temporaryPassword: string; displayName: string }> {
  const user = await db.user.findUnique({ where: { email }, select: { id: true, displayName: true } });
  if (!user) throw new DomainError("NOT_FOUND", `Aucun compte pour ${email}`);
  const temporaryPassword = generateTemporaryPassword();
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(temporaryPassword), mustChangePassword: true },
  });
  return { temporaryPassword, displayName: user.displayName };
}
