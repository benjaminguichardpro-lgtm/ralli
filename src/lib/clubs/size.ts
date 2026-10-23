// Taille d'un club selon son nombre de licenciés. Fonctions pures.

export const CLUB_SIZES = ["small", "medium", "large"] as const;
export type ClubSize = (typeof CLUB_SIZES)[number];

const SMALL_CLUB_MAX = 99;
const MEDIUM_CLUB_MAX = 299;

/** Libellés courts, pour les petites pastilles de la carte. */
export const CLUB_SIZE_SHORT_LABELS: Record<ClubSize, string> = {
  small: "Petit · < 100",
  medium: "Moyen · 100-299",
  large: "Grand · 300+",
};

/** Taille d'un club, ou null quand le nombre de licenciés n'est pas renseigné (aucun filtre de taille ne le retient). */
export function clubSize(licenseeCount: number | null): ClubSize | null {
  if (licenseeCount === null) return null;
  if (licenseeCount <= SMALL_CLUB_MAX) return "small";
  return licenseeCount <= MEDIUM_CLUB_MAX ? "medium" : "large";
}

export function isClubSize(value: string): value is ClubSize {
  return (CLUB_SIZES as readonly string[]).includes(value);
}
