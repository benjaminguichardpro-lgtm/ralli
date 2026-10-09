import { auth } from "@/auth";
import { getPhotoFor } from "@/server/avatars";

// Photo de profil : visible de son propriétaire et des membres d'un club qu'ils ont en commun.
export async function GET(_req: Request, ctx: { params: Promise<{ userId: string }> }) {
  const viewerId = (await auth())?.user?.id;
  if (!viewerId) return new Response(null, { status: 401 });
  const { userId } = await ctx.params;
  const photo = await getPhotoFor(viewerId, userId);
  if (!photo) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(photo), {
    headers: {
      "Content-Type": "image/webp",
      // L'adresse porte la date de la photo (?v=) : le navigateur peut la garder longtemps, jamais un cache partagé.
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
