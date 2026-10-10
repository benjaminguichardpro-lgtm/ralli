import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { del, get, put } from "@vercel/blob";

// Stockage des photos importées, un fichier par compte. Seul fichier qui connaît l'endroit où elles sont rangées :
// - avec BLOB_READ_WRITE_TOKEN (Vercel, ou en local si on le souhaite) : Vercel Blob, en accès PRIVÉ
//   (personne ne peut ouvrir une photo sans passer par /api/avatar, qui vérifie qui a le droit de la voir) ;
// - sans : le dossier avatar/ du projet (ignoré par git), pour le développement et les tests.

const blobEnabled = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

// Le dossier est choisi à l'exécution (AVATAR_DIR pour les tests) : on dit à Turbopack de ne pas embarquer tout le projet.
const dir = () => path.resolve(/*turbopackIgnore: true*/ process.env.AVATAR_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), "avatar"));

// L'identifiant vient de la base (cuid), mais on refuse de toute façon tout ce qui ressemble à un chemin.
function name(userId: string): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(userId)) throw new Error("Identifiant d'avatar invalide");
  return `${userId}.webp`;
}
const blobPath = (userId: string) => `avatar/${name(userId)}`;

export async function savePhoto(userId: string, data: Buffer): Promise<void> {
  if (blobEnabled()) {
    // Même nom à chaque import : la nouvelle photo remplace l'ancienne.
    await put(blobPath(userId), data, { access: "private", allowOverwrite: true, addRandomSuffix: false, contentType: "image/webp" });
    return;
  }
  await mkdir(dir(), { recursive: true });
  await writeFile(path.join(dir(), name(userId)), data);
}

export async function readPhoto(userId: string): Promise<Buffer | null> {
  if (blobEnabled()) {
    // Pas de cache : après un nouvel import, on doit relire la photo à jour.
    const result = await get(blobPath(userId), { access: "private", useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    return Buffer.from(await new Response(result.stream).arrayBuffer());
  }
  try {
    return await readFile(path.join(dir(), name(userId)));
  } catch {
    return null;
  }
}

export async function deletePhoto(userId: string): Promise<void> {
  if (blobEnabled()) {
    await del(blobPath(userId));
    return;
  }
  await rm(path.join(dir(), name(userId)), { force: true });
}
