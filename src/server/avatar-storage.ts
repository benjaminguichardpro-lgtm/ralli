import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

// Stockage des photos importées : un fichier par compte dans le dossier avatar/ (ignoré par git).
// Seul fichier à changer le jour où les photos iront sur un stockage en ligne (le disque de Vercel est en lecture seule).

// Le dossier est choisi à l'exécution (AVATAR_DIR pour les tests) : on dit à Turbopack de ne pas embarquer tout le projet.
const dir = () => path.resolve(/*turbopackIgnore: true*/ process.env.AVATAR_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), "avatar"));
// L'identifiant vient de la base (cuid), mais on refuse de toute façon tout ce qui ressemble à un chemin.
const file = (userId: string) => {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(userId)) throw new Error("Identifiant d'avatar invalide");
  return path.join(dir(), `${userId}.webp`);
};

export async function savePhoto(userId: string, data: Buffer): Promise<void> {
  await mkdir(dir(), { recursive: true });
  await writeFile(file(userId), data);
}

export async function readPhoto(userId: string): Promise<Buffer | null> {
  try {
    return await readFile(file(userId));
  } catch {
    return null;
  }
}

export async function deletePhoto(userId: string): Promise<void> {
  await rm(file(userId), { force: true });
}
