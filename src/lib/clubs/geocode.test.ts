import { describe, expect, it, vi } from "vitest";
import { geocodeAddress, geocodeQuery, parseGeocodeResponse } from "./geocode";

const ok = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
const lyon = { features: [{ geometry: { coordinates: [4.85, 45.75] }, properties: { score: 0.9 } }] };

describe("localisation d'une adresse", () => {
  it("l'API renvoie [longitude, latitude] : on les remet dans le bon ordre", () => {
    expect(parseGeocodeResponse(lyon)).toEqual({ latitude: 45.75, longitude: 4.85 });
  });
  it("aucune correspondance, score trop bas, réponse inattendue ou coordonnées absurdes : null", () => {
    expect(parseGeocodeResponse({ features: [] })).toBeNull();
    expect(parseGeocodeResponse({ features: [{ geometry: { coordinates: [4.85, 45.75] }, properties: { score: 0.1 } }] })).toBeNull();
    expect(parseGeocodeResponse({ nimporte: "quoi" })).toBeNull();
    expect(parseGeocodeResponse(null)).toBeNull();
    expect(parseGeocodeResponse({ features: [{ geometry: { coordinates: [400, 95] } }] })).toBeNull();
  });
  it("la requête reprend l'adresse affichée ; sans adresse, ville ni code postal : rien à localiser", () => {
    expect(geocodeQuery({ address: "1 rue Neuve", postalCode: "69003", city: "Lyon" })).toBe("1 rue Neuve, 69003 Lyon");
    expect(geocodeQuery({ address: null, postalCode: null, city: null })).toBeNull();
  });
  it("appelle l'API avec l'adresse et le code postal", async () => {
    const f = ok(lyon);
    await expect(geocodeAddress({ address: "1 rue Neuve", postalCode: "69003", city: "Lyon" }, f)).resolves.toEqual({ latitude: 45.75, longitude: 4.85 });
    const url = String((vi.mocked(f).mock.calls[0] as unknown[])[0]);
    expect(url).toContain("api-adresse.data.gouv.fr");
    expect(decodeURIComponent(url.replace(/\+/g, " "))).toContain("q=1 rue Neuve, 69003 Lyon");
    expect(url).toContain("postcode=69003");
  });
  it("jamais d'exception : panne réseau, code d'erreur, JSON invalide", async () => {
    const a = { address: "1 rue Neuve", postalCode: "69003", city: "Lyon" };
    await expect(geocodeAddress(a, vi.fn(async () => { throw new Error("réseau"); }) as unknown as typeof fetch)).resolves.toBeNull();
    await expect(geocodeAddress(a, vi.fn(async () => new Response("", { status: 503 })) as unknown as typeof fetch)).resolves.toBeNull();
    await expect(geocodeAddress(a, vi.fn(async () => new Response("pas du json", { status: 200 })) as unknown as typeof fetch)).resolves.toBeNull();
  });
  it("adresse vide : pas d'appel", async () => {
    const f = ok(lyon);
    await expect(geocodeAddress({ address: null, postalCode: null, city: null }, f)).resolves.toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
});
