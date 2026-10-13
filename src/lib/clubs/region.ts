// Région d'un club, déduite de son code postal (le département = les 2 premiers chiffres, 3 pour l'outre-mer).
// Fonctions pures. Un code postal absent ou inconnu donne null : le club n'apparaît alors sous aucun filtre de région.

export const REGIONS = [
  "Auvergne-Rhône-Alpes",
  "Bourgogne-Franche-Comté",
  "Bretagne",
  "Centre-Val de Loire",
  "Corse",
  "Grand Est",
  "Hauts-de-France",
  "Île-de-France",
  "Normandie",
  "Nouvelle-Aquitaine",
  "Occitanie",
  "Pays de la Loire",
  "Provence-Alpes-Côte d'Azur",
  "Guadeloupe",
  "Martinique",
  "Guyane",
  "La Réunion",
  "Mayotte",
] as const;
export type Region = (typeof REGIONS)[number];

const BY_DEPARTMENT: Record<string, Region> = {};
const add = (region: Region, departments: string[]) => departments.forEach((d) => (BY_DEPARTMENT[d] = region));
add("Auvergne-Rhône-Alpes", ["01", "03", "07", "15", "26", "38", "42", "43", "63", "69", "73", "74"]);
add("Bourgogne-Franche-Comté", ["21", "25", "39", "58", "70", "71", "89", "90"]);
add("Bretagne", ["22", "29", "35", "56"]);
add("Centre-Val de Loire", ["18", "28", "36", "37", "41", "45"]);
add("Corse", ["2A", "2B"]);
add("Grand Est", ["08", "10", "51", "52", "54", "55", "57", "67", "68", "88"]);
add("Hauts-de-France", ["02", "59", "60", "62", "80"]);
add("Île-de-France", ["75", "77", "78", "91", "92", "93", "94", "95"]);
add("Normandie", ["14", "27", "50", "61", "76"]);
add("Nouvelle-Aquitaine", ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"]);
add("Occitanie", ["09", "11", "12", "30", "31", "32", "34", "46", "48", "65", "66", "81", "82"]);
add("Pays de la Loire", ["44", "49", "53", "72", "85"]);
add("Provence-Alpes-Côte d'Azur", ["04", "05", "06", "13", "83", "84"]);
add("Guadeloupe", ["971"]);
add("Martinique", ["972"]);
add("Guyane", ["973"]);
add("La Réunion", ["974"]);
add("Mayotte", ["976"]);

/** Région d'un code postal français (5 chiffres), ou null. Monaco (98000) et les collectivités sans région propre : null. */
export function regionFromPostalCode(postalCode: string | null | undefined): Region | null {
  const code = (postalCode ?? "").replace(/\s/g, "");
  if (!/^\d{5}$/.test(code)) return null;
  if (code.startsWith("20")) {
    const n = Number(code.slice(0, 3)); // 200-201 : Corse-du-Sud, 202-206 : Haute-Corse
    return n >= 200 && n <= 206 ? "Corse" : null;
  }
  if (code.startsWith("97")) return BY_DEPARTMENT[code.slice(0, 3)] ?? null;
  return BY_DEPARTMENT[code.slice(0, 2)] ?? null;
}

export function isRegion(value: string): value is Region {
  return (REGIONS as readonly string[]).includes(value);
}
