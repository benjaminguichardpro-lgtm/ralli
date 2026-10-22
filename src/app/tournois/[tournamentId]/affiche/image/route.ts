import sharp from "sharp";
import { auth } from "@/auth";
import { parsePosterFormat, posterPageCount } from "@/lib/tournaments/poster";
import { readPhoto } from "@/server/avatar-storage";
import { DomainError } from "@/server/errors";
import { getTournamentPoster } from "@/server/tournament-poster";
import { renderPosterImage } from "@/server/tournament-poster-image";

// Image PNG d'une page de l'affiche : /tournois/<id>/affiche/image?format=ecran|story&page=1[&telecharger=1].
// Réservée au personnel du tournoi (admins du club et juges-arbitres) ; générée à chaque demande, jamais stockée ni mise en cache,
// pour refléter les scores du moment.

const notFound = () => new Response("Introuvable", { status: 404 });

/** Logo du club en PNG (Satori ne lit pas le WebP des logos importés), sous forme d'adresse « data: ». Sans logo : null. */
async function logoDataUrl(clubId: string): Promise<string | null> {
  const raw = await readPhoto(clubId, "club-logo");
  if (!raw) return null;
  const png = await sharp(raw).resize(256, 256, { fit: "inside" }).png().toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

export async function GET(req: Request, ctx: { params: Promise<{ tournamentId: string }> }) {
  const viewerId = (await auth())?.user?.id;
  if (!viewerId) return new Response("Connexion requise", { status: 401 });
  const { tournamentId } = await ctx.params;
  const url = new URL(req.url);
  const format = parsePosterFormat(url.searchParams.get("format"));
  const page = Number(url.searchParams.get("page") ?? "1");
  if (!format || !Number.isInteger(page) || page < 1) return notFound();

  let view;
  try {
    view = await getTournamentPoster(viewerId, tournamentId);
  } catch (e) {
    if (e instanceof DomainError && e.code === "NOT_FOUND") return notFound();
    throw e;
  }
  // Hors du personnel : même réponse que pour un tournoi inconnu.
  if (!view.isStaff || page > posterPageCount(view.rows.length, format)) return notFound();

  const logo = view.logoUpdatedAt ? await logoDataUrl(view.clubId) : null;
  const slug = view.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "tournoi";
  const headers: Record<string, string> = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  if (url.searchParams.get("telecharger") === "1") headers["Content-Disposition"] = `attachment; filename="affiche-${slug}-${format}-${page}.png"`;
  return await renderPosterImage({ view, format, page, logo, link: `${url.host}/tournois/${view.id}` }, headers);
}

