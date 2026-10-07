import { timingSafeEqual } from "node:crypto";
import { grantWeeklyBonus } from "@/server/weekly-bonus";

// Appelée par Vercel Cron (lundi), qui envoie « Authorization: Bearer <CRON_SECRET> ».
function authorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false; // sans secret configuré, la route reste fermée
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!authorized(request.headers.get("authorization"))) {
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  }
  return Response.json(await grantWeeklyBonus());
}
