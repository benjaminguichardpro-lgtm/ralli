import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { del, get, put } from "@vercel/blob";
import { DomainError } from "./errors";

// Stockage des photos importées, un fichier par compte (ou, avec store = "club-logo", un logo par club).
// Seul fichier qui connaît l'endroit où elles sont rangées :
// - avec BLOB_STORE_ID (Vercel : stockage relié au projet, identification automatique OIDC) ou BLOB_READ_WRITE_TOKEN
//   (ancienne méthode, ou en local si on le souhaite) : Vercel Blob, en accès PRIVÉ
//   (personne ne peut ouvrir une photo sans passer par /api/avatar, qui vérifie qui a le droit de la voir) ;
// - sans : le dossier avatar/ du projet (ignoré par git), pour le développement et les tests.

const blobEnabled = () => Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);

// Le dossier est choisi à l'exécution (AVATAR_DIR pour les tests) : on dit à Turbopack de ne pas embarquer tout le projet.
const dir = () => path.resolve(/*turbopackIgnore: true*/ process.env.AVATAR_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), "avatar"));

/** Ce qu'on range : les photos de profil (par défaut) ou les logos de clubs. */
export type Store = "avatar" | "club-logo";

// L'identifiant vient de la base (cuid), mais on refuse de toute façon tout ce qui ressemble à un chemin.
function name(userId: string): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(userId)) throw new Error("Identifiant d'avatar invalide");
  return `${userId}.webp`;
}
const blobPath = (userId: string, store: Store) => `${store}/${name(userId)}`;
// Photos de profil à la racine du dossier (comme avant), logos dans un sous-dossier.
const folder = (store: Store) => (store === "avatar" ? dir() : path.join(dir(), store));

// Une panne de stockage ne doit jamais faire planter la page : message clair pour l'utilisateur, cause réelle dans les journaux du serveur.
function unavailable(action: string, e: unknown, store: Store): DomainError {
  console.error(`[${store}] ${action} impossible :`, e);
  return new DomainError("STORAGE_UNAVAILABLE", store === "avatar" ? "La photo n'a pas pu être enregistrée. Réessaie dans un moment." : "Le logo n'a pas pu être enregistré. Réessaie dans un moment.");
}

export async function savePhoto(userId: string, data: Buffer, store: Store = "avatar"): Promise<void> {
  const file = name(userId); // refuse tout identifiant qui ressemble à un chemin, avant tout accès au stockage
  if (blobEnabled()) {
    try {
      // Même nom à chaque import : la nouvelle photo remplace l'ancienne.
      await put(blobPath(userId, store), data, { access: "private", allowOverwrite: true, addRandomSuffix: false, contentType: "image/webp" });
    } catch (e) {
      throw unavailable("enregistrement sur Vercel Blob", e, store);
    }
    return;
  }
  // Sur Vercel, le disque est en lecture seule : sans stockage Blob relié au projet, aucune photo ne peut être enregistrée.
  if (process.env.VERCEL) {
    console.error(`[${store}] ni BLOB_STORE_ID ni BLOB_READ_WRITE_TOKEN : le stockage des photos n'est pas relié à ce déploiement.`);
    throw new DomainError(
      "STORAGE_UNAVAILABLE",
      store === "avatar" ? "Les photos ne sont pas encore activées sur ce site. Choisis un avatar en attendant." : "Les logos ne sont pas encore activés sur ce site.",
    );
  }
  try {
    await mkdir(folder(store), { recursive: true });
    await writeFile(path.join(folder(store), file), data);
  } catch (e) {
    throw unavailable("enregistrement dans le dossier local", e, store);
  }
}

export async function readPhoto(userId: string, store: Store = "avatar"): Promise<Buffer | null> {
  if (blobEnabled()) {
    // Pas de cache : après un nouvel import, on doit relire la photo à jour.
    try {
      const result = await get(blobPath(userId, store), { access: "private", useCache: false });
      if (!result || result.statusCode !== 200 || !result.stream) return null;
      return Buffer.from(await new Response(result.stream).arrayBuffer());
    } catch (e) {
      console.error(`[${store}] lecture sur Vercel Blob impossible :`, e);
      return null;
    }
  }
  try {
    return await readFile(path.join(folder(store), name(userId)));
  } catch {
    return null;
  }
}

export async function deletePhoto(userId: string, store: Store = "avatar"): Promise<void> {
  if (blobEnabled()) {
    try {
      await del(blobPath(userId, store));
    } catch (e) {
      // La base dit déjà « pas de photo » : un fichier distant resté en place est sans effet visible.
      console.error(`[${store}] suppression sur Vercel Blob impossible :`, e);
    }
    return;
  }
  await rm(path.join(folder(store), name(userId)), { force: true });
}
