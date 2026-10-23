import { z } from "zod";
import { formatAddress } from "./profile";

// Position d'un club avec l'API adresse de l'État (gratuite, sans clé). Ne bloque jamais l'enregistrement de la fiche :
// toute panne ou adresse introuvable donne null (le club n'a simplement pas d'épingle).

const GEOCODE_URL = "https://api-adresse.data.gouv.fr/search/";
const GEOCODE_TIMEOUT_MS = 4000;

export type Position = { latitude: number; longitude: number };

const responseSchema = z.object({
  features: z.array(
    z.object({
      geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
      properties: z.object({ score: z.number().optional() }).optional(),
    }),
  ),
});

/** Score minimal de l'API (0 à 1) : en dessous, l'adresse trouvée est trop approximative pour une épingle. */
const MIN_SCORE = 0.4;

/** Lit la réponse de l'API adresse : la meilleure correspondance, ou null. Les coordonnées arrivent en [longitude, latitude]. */
export function parseGeocodeResponse(json: unknown): Position | null {
  const parsed = responseSchema.safeParse(json);
  if (!parsed.success) return null;
  const best = parsed.data.features[0];
  if (!best) return null;
  if ((best.properties?.score ?? 1) < MIN_SCORE) return null;
  const [longitude, latitude] = best.geometry.coordinates;
  if (!(latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180)) return null;
  return { latitude, longitude };
}

/** Texte envoyé à l'API : l'adresse complète telle qu'affichée sur la fiche, ou null si la fiche n'a ni adresse ni ville. */
export function geocodeQuery(p: { address: string | null; postalCode: string | null; city: string | null }): string | null {
  if (!p.address && !p.city && !p.postalCode) return null;
  return formatAddress(p);
}

/** Localise une adresse. Jamais d'exception : null en cas d'adresse vide, de panne, de délai dépassé ou de réponse inattendue. */
export async function geocodeAddress(
  p: { address: string | null; postalCode: string | null; city: string | null },
  fetchImpl: typeof fetch = fetch,
): Promise<Position | null> {
  const q = geocodeQuery(p);
  if (!q) return null;
  try {
    const url = new URL(GEOCODE_URL);
    url.searchParams.set("q", q);
    url.searchParams.set("limit", "1");
    if (p.postalCode && /^\d{5}$/.test(p.postalCode.trim())) url.searchParams.set("postcode", p.postalCode.trim());
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS), cache: "no-store" });
    if (!res.ok) return null;
    return parseGeocodeResponse(await res.json());
  } catch {
    return null;
  }
}
