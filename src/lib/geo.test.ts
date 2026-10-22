import { describe, expect, it } from "vitest";
import { FRANCE_KM, SLIDER_MAX, boundingBox, distanceKm, formatDistance, parseRadius, radiusFromSlider, radiusLabel, radiusPhrase, radiusTitle, sliderFromRadius } from "./geo";

const lyon = { latitude: 45.758, longitude: 4.8351 };
const paris = { latitude: 48.8589, longitude: 2.347 };
const nantes = { latitude: 47.2184, longitude: -1.5536 };

describe("distance à vol d'oiseau", () => {
  it("Lyon – Paris : environ 392 km ; un point avec lui-même : 0", () => {
    expect(distanceKm(lyon, paris)).toBeGreaterThan(388);
    expect(distanceKm(lyon, paris)).toBeLessThan(396);
    expect(distanceKm(lyon, lyon)).toBe(0);
  });
  it("symétrique", () => {
    expect(distanceKm(paris, nantes)).toBeCloseTo(distanceKm(nantes, paris), 6);
  });
  it("un degré de latitude : environ 111 km", () => {
    expect(distanceKm({ latitude: 45, longitude: 5 }, { latitude: 46, longitude: 5 })).toBeCloseTo(111.2, 0);
  });
  it("de l'autre côté de la ligne de changement de date : courte distance", () => {
    expect(distanceKm({ latitude: 0, longitude: 179.9 }, { latitude: 0, longitude: -179.9 })).toBeLessThan(25);
  });
});

describe("rectangle de recherche", () => {
  it("contient tous les points à moins de 30 km (vérifié sur des points du cercle)", () => {
    const box = boundingBox(lyon, 30);
    for (const bearing of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const rad = (bearing * Math.PI) / 180;
      const p = { latitude: lyon.latitude + (29.9 / 111.2) * Math.cos(rad), longitude: lyon.longitude + (29.9 / (111.2 * Math.cos((lyon.latitude * Math.PI) / 180))) * Math.sin(rad) };
      expect(distanceKm(lyon, p)).toBeLessThanOrEqual(30);
      expect(p.latitude).toBeGreaterThanOrEqual(box.minLat);
      expect(p.latitude).toBeLessThanOrEqual(box.maxLat);
      expect(p.longitude).toBeGreaterThanOrEqual(box.minLon);
      expect(p.longitude).toBeLessThanOrEqual(box.maxLon);
    }
  });
  it("Nantes est hors du rectangle de Lyon à 200 km", () => {
    const box = boundingBox(lyon, 200);
    expect(nantes.longitude < box.minLon || nantes.longitude > box.maxLon).toBe(true);
  });
  it("près de la ligne de changement de date : toute la longitude", () => {
    const box = boundingBox({ latitude: -17, longitude: 179.5 }, 100);
    expect(box.minLon).toBe(-180);
    expect(box.maxLon).toBe(180);
  });
});

describe("rayon saisi et distance affichée", () => {
  it("entier de 0 à 200, ou 999 (toute la France)", () => {
    expect(parseRadius("30")).toBe(30);
    expect(parseRadius(" 200 ")).toBe(200);
    expect(parseRadius("1")).toBe(1);
    expect(parseRadius("0")).toBe(0);
    expect(parseRadius("999")).toBe(FRANCE_KM);
    for (const bad of ["201", "998", "1000", "-5", "12,5", "abc", "", null, undefined]) expect(parseRadius(bad), String(bad)).toBeNull();
  });
  it("la barre : 0 à 200 = kilomètres, dernier cran = toute la France", () => {
    expect(SLIDER_MAX).toBe(201);
    expect([0, 1, 60, 200, 201].map(radiusFromSlider)).toEqual([0, 1, 60, 200, 999]);
    expect([0, 1, 60, 200, 999].map(sliderFromRadius)).toEqual([0, 1, 60, 200, 201]);
    expect(radiusFromSlider(sliderFromRadius(137))).toBe(137);
  });
  it("libellés : mes clubs, kilomètres, toute la France", () => {
    expect([0, 30, 200, 999].map(radiusLabel)).toEqual(["Mes clubs", "30 km", "200 km", "Toute la France"]);
    expect(radiusTitle(30, "Lyon")).toBe("À moins de 30 km de Lyon");
    expect(radiusTitle(30, null)).toBe("À moins de 30 km");
    expect(radiusTitle(0, "Lyon")).toBe("Mes clubs");
    expect(radiusTitle(999, null)).toBe("Toute la France");
    expect([0, 30, 999].map(radiusPhrase)).toEqual(["dans tes clubs", "à moins de 30 km", "en France"]);
  });
  it("libellé de distance", () => {
    expect(formatDistance(0.4)).toBe("à moins de 1 km");
    expect(formatDistance(12.4)).toBe("à 12 km");
    expect(formatDistance(12.6)).toBe("à 13 km");
  });
});
