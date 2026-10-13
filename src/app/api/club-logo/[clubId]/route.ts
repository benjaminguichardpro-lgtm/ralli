import { auth } from "@/auth";
import { getClubLogoFor } from "@/server/club-profile";
import { getPublicClubLogo } from "@/server/club-public";

// Logo d'un club : visible de tout compte connecté (les clubs sont publics dans Ralli), et de tous si la page publique est activée.
export async function GET(_req: Request, ctx: { params: Promise<{ clubId: string }> }) {
  const viewerId = (await auth())?.user?.id;
  const { clubId } = await ctx.params;
  const logo = viewerId ? await getClubLogoFor(viewerId, clubId) : await getPublicClubLogo(clubId);
  if (!viewerId && !logo) return new Response(null, { status: 401 }); // sans compte : rien à voir, sauf le logo d'une page publique
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
