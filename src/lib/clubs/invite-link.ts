/** Adresse (sans le site) de la page d'un club : c'est le lien qu'un membre partage pour inviter. */
export function clubPath(clubId: string): string {
  return `/clubs/${clubId}`;
}

// Identifiant de club (cuid) : lettres minuscules et chiffres seulement, jamais d'adresse libre.
const CLUB_ID = /^c[a-z0-9]{20,30}$/;

/** Identifiant de club lu dans une adresse ou un champ caché : bien formé, sinon null. */
export function parseClubParam(value: string | string[] | undefined | null): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return CLUB_ID.test(id) ? id : null;
}

/** Où aller après une connexion ou une inscription : la page du club d'où l'on vient, sinon l'accueil. */
export function afterAuthPath(club: string | null | undefined): string {
  const id = parseClubParam(club);
  return id ? clubPath(id) : "/";
}
