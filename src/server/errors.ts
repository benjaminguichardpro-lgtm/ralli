import { Prisma } from "@/generated/prisma/client";

export type DomainErrorCode =
  | "EMAIL_TAKEN"
  | "DISPLAY_NAME_TAKEN"
  | "REMOVED_FROM_CLUB"
  | "CANNOT_REMOVE"
  | "ALREADY_MEMBER"
  | "REQUEST_PENDING"
  | "STORY_INVALID"
  | "ALREADY_SHARED"
  | "ALREADY_REPORTED"
  | "CANNOT_LEAVE"
  | "CLUB_CREATION_NOT_ALLOWED"
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
