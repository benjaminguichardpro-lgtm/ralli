import { db } from "@/lib/db";
import { FRANCE_KM, boundingBox, distanceKm } from "@/lib/geo";

// Quels clubs la barre de distance retient-elle ? Partagé par « Interclub à proximité » et « Tournoi à venir ».
//  - 0 km : les clubs dont la personne est membre ;
//  - 1 à 200 km : les clubs localisés à ce rayon de la commune de la personne (les siens y compris, s'ils sont dans le rayon) ;
//  - toute la France : tous les clubs, localisés ou non.
// Un rayon intermédiaire demande le code postal (la commune de la personne) : sans lui, `needsLocation` est vrai et aucun club n'est rendu.

export type ScopedClub = {
  id: string;
  name: string;
  logoUpdatedAt: Date | null;
  /** Distance à vol d'oiseau depuis la commune de la personne ; null si l'un des deux n'est pas localisé. */
  km: number | null;
  isMember: boolean;
};

export type ClubScope = {
  /** Vrai si le code postal est enregistré et localisé. */
  located: boolean;
  commune: string | null;
  needsLocation: boolean;
  clubs: ScopedClub[];
};

const clubSelect = { id: true, name: true, logoUpdatedAt: true, latitude: true, longitude: true } as const;

export async function clubsForRadius(userId: string, radiusKm: number): Promise<ClubScope> {
  const me = await db.user.findUnique({
    where: { id: userId },
    select: { commune: true, latitude: true, longitude: true, memberships: { where: { club: { deletedAt: null } }, select: { clubId: true } } },
  });
  const origin = me && me.latitude !== null && me.longitude !== null ? { latitude: me.latitude, longitude: me.longitude } : null;
  const base = { located: origin !== null, commune: me?.commune ?? null };
  const mine = new Set((me?.memberships ?? []).map((m) => m.clubId));

  type Row = { id: string; name: string; logoUpdatedAt: Date | null; latitude: number | null; longitude: number | null };
  let rows: Row[];
  if (radiusKm === 0) {
    rows = mine.size === 0 ? [] : await db.club.findMany({ where: { id: { in: [...mine] }, deletedAt: null }, select: clubSelect });
  } else if (radiusKm === FRANCE_KM) {
    rows = await db.club.findMany({ where: { deletedAt: null }, select: clubSelect });
  } else {
    if (!origin) return { ...base, needsLocation: true, clubs: [] };
    const box = boundingBox(origin, radiusKm);
    rows = await db.club.findMany({ where: { deletedAt: null, latitude: { gte: box.minLat, lte: box.maxLat }, longitude: { gte: box.minLon, lte: box.maxLon } }, select: clubSelect });
  }
  const clubs = rows
    .map((c): ScopedClub => ({
      id: c.id,
      name: c.name,
      logoUpdatedAt: c.logoUpdatedAt,
      km: origin && c.latitude !== null && c.longitude !== null ? distanceKm(origin, { latitude: c.latitude, longitude: c.longitude }) : null,
      isMember: mine.has(c.id),
    }))
    .filter((c) => radiusKm === 0 || radiusKm === FRANCE_KM || (c.km !== null && c.km <= radiusKm));
  return { ...base, needsLocation: false, clubs };
}
