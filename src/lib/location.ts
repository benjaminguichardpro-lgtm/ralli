import { z } from "zod";
import type { Point } from "./geo";

// Position d'un compte pour « rencontres à proximité » : code postal facultatif → centre de la commune (geo.api.gouv.fr,
// gratuit et sans clé). Jamais d'adresse précise. Ne lève aucune exception : une panne donne `UNAVAILABLE`.

export const COMMUNES_URL = "https://geo.api.gouv.fr/communes";
export const COMMUNES_TIMEOUT_MS = 8000;

/** Code postal français : 5 chiffres (espaces tolérés). Vide = effacer. */
export const postalCodeSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/\s/g, ""))
  .refine((s) => s === "" || /^\d{5}$/.test(s), { error: "Un code postal a 5 chiffres (exemple : 69003)" })
  .transform((s) => (s === "" ? null : s));

export type Commune = { name: string; position: Point };

const responseSchema = z.array(
  z.object({
    nom: z.string(),
    centre: z.object({ coordinates: z.tuple([z.number(), z.number()]) }),
    population: z.number().optional(),
  }),
);

/** Réponse de l'API : la commune la plus peuplée du code postal (centre en [longitude, latitude]), ou null si aucune. */
export function parseCommunes(json: unknown): Commune | null {
  const parsed = responseSchema.safeParse(json);
  if (!parsed.success || parsed.data.length === 0) return null;
  const best = [...parsed.data].sort((a, b) => (b.population ?? 0) - (a.population ?? 0))[0]!;
  const [longitude, latitude] = best.centre.coordinates;
  if (!(latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180)) return null;
  return { name: best.nom, position: { latitude, longitude } };
}

export type LocateResult = { status: "FOUND"; commune: Commune } | { status: "UNKNOWN" } | { status: "UNAVAILABLE" };

/** Cherche la commune d'un code postal. UNKNOWN : aucun résultat ; UNAVAILABLE : panne, délai dépassé ou réponse inattendue. */
export async function locatePostalCode(postalCode: string, fetchImpl: typeof fetch = fetch): Promise<LocateResult> {
  try {
    const url = new URL(COMMUNES_URL);
    url.searchParams.set("codePostal", postalCode);
    url.searchParams.set("fields", "nom,centre,population");
    url.searchParams.set("format", "json");
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(COMMUNES_TIMEOUT_MS), cache: "no-store" });
    if (!res.ok) return { status: "UNAVAILABLE" };
    const json: unknown = await res.json();
    if (!Array.isArray(json)) return { status: "UNAVAILABLE" };
    const commune = parseCommunes(json);
    return commune ? { status: "FOUND", commune } : json.length === 0 ? { status: "UNKNOWN" } : { status: "UNAVAILABLE" };
  } catch {
    return { status: "UNAVAILABLE" };
  }
}
