import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";

// Coût bcrypt : 12 en prod ; abaissable en test via BCRYPT_ROUNDS pour garder des tests rapides.
const ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 12);

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Sans caractères ambigus (0/O, 1/I/l) pour une lecture à voix haute ou au téléphone.
const TEMP_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Mot de passe temporaire (script de dépannage `npm run reset-password`). */
export function generateTemporaryPassword(length = 12): string {
  let out = "";
  for (let i = 0; i < length; i++) out += TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)];
  return out;
}
