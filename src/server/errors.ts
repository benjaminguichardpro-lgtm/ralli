import { Prisma } from "@/generated/prisma/client";

export type DomainErrorCode =
  | "EMAIL_TAKEN"
  | "DISPLAY_NAME_TAKEN"
  | "INVALID_INVITE_CODE"
  | "ALREADY_MEMBER"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "LAST_ADMIN"
  | "TEAM_NAME_TAKEN"
  | "NOT_A_MEMBER"
  | "INVALID"
  | "ALREADY_IN_TEAM"
  | "PLAYER_HAS_MATCHES"
  | "PLAYER_LOCKED"
  | "ALREADY_LINKED"
  | "CONFLICT"
  | "INVALID_TRANSITION"
  | "STORAGE_UNAVAILABLE";

/** Erreur métier attendue, avec un message affichable tel quel à l'utilisateur. */
export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

/** Vrai si l'erreur est une violation d'unicité Prisma (P2002), éventuellement sur un champ donné. */
export function isUniqueViolation(e: unknown, field?: string): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") return false;
  if (!field) return true;
  return JSON.stringify(e.meta ?? {}).includes(field);
}
