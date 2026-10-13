import { db } from "@/lib/db";
import { type EffectiveStatus, STATUS_LABELS, effectiveStatus } from "@/lib/encounters/state";
import { boundingBox, distanceKm, parseRadius } from "@/lib/geo";
import { type LocateResult, locatePostalCode, postalCodeSchema } from "@/lib/location";
import { sideLabel } from "./encounters";
import { DomainError } from "./errors";

// Rencontres à proximité : la ville de la personne (code postal facultatif, privé) et un rayon réglable (30 km par défaut).
// On ne garde que le centre de la commune. Les clubs sans adresse localisée sur la carte ne peuvent pas être placés.

export type MyLocation = {
  postalCode: string | null;
  commune: string | null;
  /** Vrai si le code postal est enregistré et localisé : la recherche à proximité est possible. */
  located: boolean;
  radiusKm: number;
};

export async function getMyLocation(userId: string): Promise<MyLocation> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { postalCode: true, commune: true, latitude: true, nearbyRadiusKm: true } });
  if (!u) throw new DomainError("NOT_FOUND", "Compte introuvable");
  return { postalCode: u.postalCode, commune: u.commune, located: u.postalCode !== null && u.latitude !== null, radiusKm: u.nearbyRadiusKm };
}

/**
 * Enregistre (ou efface, avec un texte vide) le code postal du compte. Il est vérifié : 5 chiffres, et une commune doit
 * exister (geo.api.gouv.fr). Rien n'est enregistré en cas d'échec : la panne du service n'efface pas un code déjà valide.
 */
export async function setMyPostalCode(userId: string, rawCode: string, locate: (code: string) => Promise<LocateResult> = locatePostalCode): Promise<{ commune: string | null }> {
  const parsed = postalCodeSchema.safeParse(rawCode);
  if (!parsed.success) throw new DomainError("INVALID", parsed.error.issues[0]?.message ?? "Code postal invalide");
  const code = parsed.data;
  if (code === null) {
    await db.user.update({ where: { id: userId }, data: { postalCode: null, commune: null, latitude: null, longitude: null } });
    return { commune: null };
  }
  const found = await locate(code);
  if (found.status === "UNKNOWN") throw new DomainError("INVALID", "Code postal introuvable : vérifie-le (exemple : 69003)");
  if (found.status === "UNAVAILABLE") throw new DomainError("INVALID", "Impossible de vérifier ce code postal pour l'instant : réessaie dans un instant");
  const { name, position } = found.commune;
  await db.user.update({ where: { id: userId }, data: { postalCode: code, commune: name, latitude: position.latitude, longitude: position.longitude } });
  return { commune: name };
}

/** Rayon de la recherche à proximité : entier de 1 à 200 km, gardé dans le compte. */
export async function setMyRadius(userId: string, raw: unknown): Promise<number> {
  const km = parseRadius(raw);
  if (km === null) throw new DomainError("INVALID", "Le rayon est un nombre entier de kilomètres, de 1 à 200");
  await db.user.update({ where: { id: userId }, data: { nearbyRadiusKm: km } });
  return km;
}

export type NearbyEncounter = {
  id: string;
  status: EffectiveStatus;
  statusLabel: string;
  startsAt: Date;
  predictionsCloseAt: Date;
  home: string;
  away: string;
  matchCount: number;
  club: { id: string; name: string; logoUpdatedAt: Date | null };
  /** Distance à vol d'oiseau entre la commune de la personne et le club. */
  distanceKm: number;
  isMember: boolean;
};

export type NearbyResult = { radiusKm: number; commune: string | null; clubsInRange: number; encounters: NearbyEncounter[] };

const MAX_RESULTS = 50;

/**
 * Rencontres publiées (pronostics ouverts), non archivées et pas encore commencées des clubs situés dans le rayon, la plus proche
 * dans le temps d'abord. Les clubs sont publics : un club dont on n'est pas membre apparaît aussi (page en lecture seule).
 * Null si la personne n'a pas renseigné son code postal.
 */
export async function listNearbyEncounters(userId: string, now = new Date()): Promise<NearbyResult | null> {
  const me = await db.user.findUnique({ where: { id: userId }, select: { postalCode: true, commune: true, latitude: true, longitude: true, nearbyRadiusKm: true } });
  if (!me || me.latitude === null || me.longitude === null) return null;
  const origin = { latitude: me.latitude, longitude: me.longitude };
  const box = boundingBox(origin, me.nearbyRadiusKm);
  const clubs = await db.club.findMany({
    where: { latitude: { gte: box.minLat, lte: box.maxLat }, longitude: { gte: box.minLon, lte: box.maxLon } },
    select: { id: true, name: true, logoUpdatedAt: true, latitude: true, longitude: true, memberships: { where: { userId }, select: { userId: true } } },
  });
  const inRange = clubs
    .map((c) => ({ ...c, km: distanceKm(origin, { latitude: c.latitude!, longitude: c.longitude! }) }))
    .filter((c) => c.km <= me.nearbyRadiusKm);
  const byId = new Map(inRange.map((c) => [c.id, c]));
  const rows = await db.encounter.findMany({
    where: { organizerClubId: { in: [...byId.keys()] }, status: "OPEN", archivedAt: null, startsAt: { gt: now } },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    take: MAX_RESULTS,
    select: {
      id: true,
      status: true,
      startsAt: true,
      predictionsCloseAt: true,
      organizerClubId: true,
      homeTeam: { select: { name: true, kind: true, externalClubName: true, club: { select: { name: true } } } },
      awayTeam: { select: { name: true, kind: true, externalClubName: true, club: { select: { name: true } } } },
      _count: { select: { matches: { where: { voidedAt: null } } } },
    },
  });
  const encounters = rows.map((e) => {
    const club = byId.get(e.organizerClubId)!;
    const status = effectiveStatus(e, now);
    return {
      id: e.id,
      status,
      statusLabel: STATUS_LABELS[status],
      startsAt: e.startsAt,
      predictionsCloseAt: e.predictionsCloseAt,
      home: sideLabel(e.homeTeam),
      away: sideLabel(e.awayTeam),
      matchCount: e._count.matches,
      club: { id: club.id, name: club.name, logoUpdatedAt: club.logoUpdatedAt },
      distanceKm: club.km,
      isMember: club.memberships.length > 0,
    };
  });
  return { radiusKm: me.nearbyRadiusKm, commune: me.commune, clubsInRange: inRange.length, encounters };
}
