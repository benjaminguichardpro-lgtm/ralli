// Distances à vol d'oiseau, pour « Interclub à proximité » et « Tournoi à venir ». Fonctions pures.

/** Barre de distance : 0 = mes clubs seulement, 1 à 200 km autour de la commune, puis « toute la France » (valeur enregistrée : 999). */
export const MIN_RADIUS_KM = 0;
export const MAX_RADIUS_KM = 200;
export const FRANCE_KM = 999;
/** Position du dernier cran de la barre (« France ») : 0 à 200 = kilomètres, 201 = toute la France. */
export const SLIDER_MAX = MAX_RADIUS_KM + 1;

const EARTH_RADIUS_KM = 6371;
const KM_PER_DEGREE = 111.2; // un degré de latitude

const rad = (deg: number) => (deg * Math.PI) / 180;

export type Point = { latitude: number; longitude: number };

/** Distance en km entre deux points (formule de haversine). */
export function distanceKm(a: Point, b: Point): number {
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Rectangle qui contient tout le disque de rayon `radiusKm` autour de `center` : sert à écarter vite les clubs lointains
 * avant le calcul exact. Près des pôles ou autour de la ligne de changement de date, le rectangle s'étend à toute la longitude.
 */
export function boundingBox(center: Point, radiusKm: number): { minLat: number; maxLat: number; minLon: number; maxLon: number } {
  const dLat = radiusKm / KM_PER_DEGREE;
  const cosLat = Math.cos(rad(center.latitude));
  const dLon = cosLat < 0.01 ? 180 : radiusKm / (KM_PER_DEGREE * cosLat);
  const minLon = center.longitude - dLon;
  const maxLon = center.longitude + dLon;
  const wraps = dLon >= 180 || minLon < -180 || maxLon > 180;
  return {
    minLat: Math.max(-90, center.latitude - dLat),
    maxLat: Math.min(90, center.latitude + dLat),
    minLon: wraps ? -180 : minLon,
    maxLon: wraps ? 180 : maxLon,
  };
}

/** Rayon saisi (texte ou nombre) : entier de 0 à 200 km, ou 999 (toute la France), sinon null. */
export function parseRadius(raw: unknown): number | null {
  const text = String(raw ?? "").trim();
  if (!/^\d{1,3}$/.test(text)) return null;
  const n = Number(text);
  return n === FRANCE_KM || (n >= MIN_RADIUS_KM && n <= MAX_RADIUS_KM) ? n : null;
}

/** Position de la barre (0 à 201) → rayon enregistré. */
export const radiusFromSlider = (position: number): number => (position >= SLIDER_MAX ? FRANCE_KM : Math.max(MIN_RADIUS_KM, Math.min(MAX_RADIUS_KM, Math.round(position))));
/** Rayon enregistré → position de la barre. */
export const sliderFromRadius = (km: number): number => (km === FRANCE_KM ? SLIDER_MAX : Math.max(MIN_RADIUS_KM, Math.min(MAX_RADIUS_KM, km)));

/** Libellé du rayon : « Mes clubs », « 30 km », « Toute la France ». */
export function radiusLabel(km: number): string {
  if (km === FRANCE_KM) return "Toute la France";
  if (km === 0) return "Mes clubs";
  return `${km} km`;
}

/** Titre d'un résultat selon la barre de distance : « À moins de 30 km de Lyon », « Mes clubs », « Toute la France ». */
export function radiusTitle(km: number, commune: string | null): string {
  if (km === FRANCE_KM || km === 0) return radiusLabel(km);
  return `À moins de ${km} km${commune ? ` de ${commune}` : ""}`;
}

/** Fin de phrase d'un message « aucun résultat » : « à moins de 30 km », « dans tes clubs », « en France ». */
export function radiusPhrase(km: number): string {
  if (km === FRANCE_KM) return "en France";
  if (km === 0) return "dans tes clubs";
  return `à moins de ${km} km`;
}

/** « à 12 km », « à moins de 1 km ». */
export function formatDistance(km: number): string {
  if (km < 1) return "à moins de 1 km";
  return `à ${Math.round(km).toLocaleString("fr-FR")} km`;
}
