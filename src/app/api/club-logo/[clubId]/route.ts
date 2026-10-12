import { auth } from "@/auth";
import { getClubLogoFor } from "@/server/club-profile";

// Logo d'un club : visible de tout compte connecté (les clubs sont publics dans Ralli).
export async function GET(_req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  const viewerId = (await auth())?.user?.id;
  if (!viewerId) return new Response(null, { status: 401 });
  const { clubId } = await ctx.params;
  const logo = await getClubLogoFor(viewerId, clubId);
  if (!logo) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(logo), {
    headers: {
      "Content-Type": "image/webp",
      // L'adresse porte la date du logo (?v=) : le navigateur peut le garder longtemps, jamais un cache partagé.
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
