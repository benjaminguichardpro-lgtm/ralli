import { randomInt } from "node:crypto";

// 6 caractères, sans 0/O ni 1/I (brief, décision 5).
export const INVITE_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const INVITE_CODE_LENGTH = 6;

export function generateInviteCode(): string {
  let out = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    out += INVITE_CODE_ALPHABET[randomInt(INVITE_CODE_ALPHABET.length)];
  }
  return out;
}

/** Un code contenant 0, O, 1 ou I est forcément faux : on le rejette sans requête en base. */
export function isWellFormedInviteCode(code: string): boolean {
  if (code.length !== INVITE_CODE_LENGTH) return false;
  return [...code].every((c) => INVITE_CODE_ALPHABET.includes(c));
}
