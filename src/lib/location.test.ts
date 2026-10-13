import { describe, expect, it, vi } from "vitest";
import { locatePostalCode, parseCommunes, postalCodeSchema } from "./location";

const ok = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
const lyon = [{ nom: "Lyon", centre: { type: "Point", coordinates: [4.8351, 45.758] }, population: 519127 }];

describe("code postal saisi", () => {
  it("5 chiffres, espaces tolérés ; vide = effacer", () => {
    expect(postalCodeSchema.parse("69003")).toBe("69003");
    expect(postalCodeSchema.parse(" 69 003 ")).toBe("69003");
    expect(postalCodeSchema.parse("")).toBeNull();
    expect(postalCodeSchema.parse("   ")).toBeNull();
  });
  it("refuse le reste", () => {
    for (const bad of ["6900", "690033", "ABCDE", "69-03", "69003 Lyon"]) expect(postalCodeSchema.safeParse(bad).success, bad).toBe(false);
  });
});

describe("réponse de l'API des communes", () => {
  it("[longitude, latitude] remis dans le bon ordre ; la commune la plus peuplée l'emporte", () => {
    expect(parseCommunes(lyon)).toEqual({ name: "Lyon", position: { latitude: 45.758, longitude: 4.8351 } });
    const two = [
      { nom: "Petit-Village", centre: { coordinates: [1, 2] }, population: 300 },
      { nom: "Grande-Ville", centre: { coordinates: [3, 4] }, population: 90000 },
    ];
    expect(parseCommunes(two)?.name).toBe("Grande-Ville");
  });
  it("vide, mal formé ou coordonnées absurdes : null", () => {
    expect(parseCommunes([])).toBeNull();
    expect(parseCommunes({ a: 1 })).toBeNull();
    expect(parseCommunes([{ nom: "X", centre: { coordinates: [400, 95] } }])).toBeNull();
  });
});

describe("recherche d'une commune", () => {
  it("trouvée", async () => {
    const f = ok(lyon);
    await expect(locatePostalCode("69003", f)).resolves.toMatchObject({ status: "FOUND", commune: { name: "Lyon" } });
    expect(String((vi.mocked(f).mock.calls[0] as unknown[])[0])).toContain("codePostal=69003");
  });
  it("code inconnu : UNKNOWN", async () => {
    await expect(locatePostalCode("99999", ok([]))).resolves.toEqual({ status: "UNKNOWN" });
  });
  it("jamais d'exception : panne, erreur HTTP, JSON invalide, réponse inattendue : UNAVAILABLE", async () => {
    await expect(locatePostalCode("69003", vi.fn(async () => { throw new Error("réseau"); }) as unknown as typeof fetch)).resolves.toEqual({ status: "UNAVAILABLE" });
    await expect(locatePostalCode("69003", ok({}, 503))).resolves.toEqual({ status: "UNAVAILABLE" });
    await expect(locatePostalCode("69003", vi.fn(async () => new Response("pas du json")) as unknown as typeof fetch)).resolves.toEqual({ status: "UNAVAILABLE" });
    await expect(locatePostalCode("69003", ok({ erreur: true }))).resolves.toEqual({ status: "UNAVAILABLE" });
    await expect(locatePostalCode("69003", ok([{ nimporte: "quoi" }]))).resolves.toEqual({ status: "UNAVAILABLE" });
  });
});
