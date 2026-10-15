import { buildPlayersTemplateXlsx } from "@/lib/players/template-xlsx";

// Modèle Excel (.xlsx) : colonnes en format Texte, pour que « 30/2 » reste « 30/2 ». Contenu fixe, sans donnée du club.
export function GET() {
  return new Response(Buffer.from(buildPlayersTemplateXlsx()), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="modele-joueurs-ralli.xlsx"',
      "Cache-Control": "public, max-age=86400",
    },
  });
}
