import { IMPORT_TEMPLATE } from "@/lib/players/import";

// Modèle de fichier pour l'import des joueurs : CSV (« ; », accents corrects dans Excel). Contenu fixe, sans donnée du club.
export function GET() {
  return new Response(IMPORT_TEMPLATE, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="modele-joueurs-ralli.csv"',
      "Cache-Control": "public, max-age=86400",
    },
  });
}
