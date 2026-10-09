import { isWellFormedInviteCode } from "./invite-code";

/** Adresse (sans le site) du lien d'invitation d'un club. */
export function invitePath(code: string): string {
  return `/rejoindre/${code}`;
}

/**
 * Code d'invitation lu dans une adresse ou un champ caché : en majuscules, bien formé, sinon null.
 * Sert aussi de garde-fou : seule une adresse construite par `invitePath` est utilisée pour rediriger.
 */
export function parseInviteParam(value: string | string[] | undefined | null): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return isWellFormedInviteCode(code) ? code : null;
}

/** Où aller après une connexion ou une inscription : la page d'invitation si le code est valable, sinon l'accueil. */
export function afterAuthPath(invitation: string | null | undefined): string {
  const code = parseInviteParam(invitation);
  return code ? invitePath(code) : "/";
}
