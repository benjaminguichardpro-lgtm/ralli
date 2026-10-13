// Données envoyées à la carte : seulement les clubs localisés, avec de quoi remplir la petite fenêtre d'une épingle.

export type MapClub = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  /** « 69003 Lyon », ou chaîne vide. */
  place: string;
  /** « 12 personnes suivent ce club ». */
  followersLabel: string;
};

/** « 12 personnes suivent ce club » : le compteur affiché partout où un club apparaît. */
export function followersLabel(n: number): string {
  if (n === 0) return "Sois le premier à suivre ce club";
  return n === 1 ? "1 personne suit ce club" : `${n.toLocaleString("fr-FR")} personnes suivent ce club`;
}

type CardLike = { id: string; name: string; city: string | null; postalCode: string | null; followers: number; latitude: number | null; longitude: number | null };

/** Garde les clubs qui ont une position et prépare leurs fenêtres. Un club sans position n'a pas d'épingle (il reste dans la liste). */
export function toMapClubs(clubs: CardLike[]): MapClub[] {
  const out: MapClub[] = [];
  for (const c of clubs) {
    if (c.latitude === null || c.longitude === null) continue;
    out.push({ id: c.id, name: c.name, latitude: c.latitude, longitude: c.longitude, place: [c.postalCode, c.city].filter(Boolean).join(" "), followersLabel: followersLabel(c.followers) });
  }
  return out;
}
