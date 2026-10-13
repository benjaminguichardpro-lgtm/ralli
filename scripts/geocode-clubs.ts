// Localise les clubs qui ont une adresse mais pas encore de position sur la carte (une fois, à ta demande).
// Usage : npm run geocode-clubs. Un club déjà localisé n'est pas touché ; l'API adresse de l'État est interrogée à 1 requête par seconde.
import "dotenv/config";
import { geocodeAddress } from "@/lib/clubs/geocode";
import { regionFromPostalCode } from "@/lib/clubs/region";
import { db } from "@/lib/db";

async function main() {
  const clubs = await db.club.findMany({
    where: { latitude: null, OR: [{ address: { not: null } }, { city: { not: null } }, { postalCode: { not: null } }] },
    select: { id: true, name: true, address: true, postalCode: true, city: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`${clubs.length} club(s) à localiser.`);
  let done = 0;
  for (const c of clubs) {
    const pos = await geocodeAddress(c);
    await db.club.update({
      where: { id: c.id },
      data: { region: regionFromPostalCode(c.postalCode), ...(pos ? { latitude: pos.latitude, longitude: pos.longitude } : {}) },
    });
    if (pos) done++;
    console.log(`${pos ? "OK " : "-- "} ${c.name}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log(`${done} club(s) localisé(s) sur ${clubs.length}.`);
  await db.$disconnect();
}

void main();
