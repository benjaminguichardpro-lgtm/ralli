import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const blob = vi.hoisted(() => ({ put: vi.fn(), get: vi.fn(), del: vi.fn() }));
vi.mock("@vercel/blob", () => blob);

import { deletePhoto, readPhoto, savePhoto } from "./avatar-storage";

const photo = Buffer.from("webp-bytes");
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "ralli-avatar-"));
  process.env.AVATAR_DIR = dir;
  vi.resetAllMocks(); // efface aussi les réponses simulées du test précédent
});
afterEach(async () => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_STORE_ID;
  delete process.env.VERCEL;
  delete process.env.AVATAR_DIR;
  await rm(dir, { recursive: true, force: true });
});

describe("sans jeton Vercel Blob : dossier local", () => {
  it("enregistre, relit et supprime un fichier, sans toucher à Vercel Blob", async () => {
    await savePhoto("abc123", photo);
    expect((await readFile(path.join(dir, "abc123.webp"))).equals(photo)).toBe(true);
    expect((await readPhoto("abc123"))?.equals(photo)).toBe(true);
    await deletePhoto("abc123");
    expect(await readPhoto("abc123")).toBeNull();
    expect(blob.put).not.toHaveBeenCalled();
    expect(blob.get).not.toHaveBeenCalled();
    expect(blob.del).not.toHaveBeenCalled();
  });

  it("refuse d'écrire sous un identifiant qui ressemble à un chemin", async () => {
    await expect(savePhoto("../secret", photo)).rejects.toThrow("Identifiant d'avatar invalide");
    expect(await readPhoto("a/b")).toBeNull(); // lecture : introuvable, comme avant
  });
});

describe("logos de clubs (store « club-logo »)", () => {
  it("rangés dans un sous-dossier, sans toucher aux photos de profil du même identifiant", async () => {
    await savePhoto("abc123", photo);
    await savePhoto("abc123", Buffer.from("logo-bytes"), "club-logo");
    expect((await readPhoto("abc123"))?.equals(photo)).toBe(true);
    expect((await readPhoto("abc123", "club-logo"))?.toString()).toBe("logo-bytes");
    expect((await readFile(path.join(dir, "club-logo", "abc123.webp"))).toString()).toBe("logo-bytes");
    await deletePhoto("abc123", "club-logo");
    expect(await readPhoto("abc123", "club-logo")).toBeNull();
    expect((await readPhoto("abc123"))?.equals(photo)).toBe(true);
  });

  it("utilise le préfixe club-logo/ sur Vercel Blob", async () => {
    process.env.BLOB_STORE_ID = "store_abc123";
    await savePhoto("abc123", photo, "club-logo");
    expect(blob.put).toHaveBeenCalledWith("club-logo/abc123.webp", photo, expect.objectContaining({ access: "private" }));
  });
});

describe("stockage relié par Vercel (BLOB_STORE_ID, identification automatique) : sans jeton", () => {
  it("utilise Vercel Blob en accès privé, sans toucher au disque, même sur Vercel", async () => {
    process.env.BLOB_STORE_ID = "store_abc123";
    process.env.VERCEL = "1";
    await savePhoto("abc123", photo);
    expect(blob.put).toHaveBeenCalledWith("avatar/abc123.webp", photo, expect.objectContaining({ access: "private", allowOverwrite: true }));
    await expect(readFile(path.join(dir, "abc123.webp"))).rejects.toThrow();
    blob.get.mockResolvedValue({ statusCode: 200, stream: new Response(photo).body });
    expect((await readPhoto("abc123"))?.equals(photo)).toBe(true);
    await deletePhoto("abc123");
    expect(blob.del).toHaveBeenCalledWith("avatar/abc123.webp");
  });
});

describe("pannes de stockage : un message clair, jamais un plantage", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it("sur Vercel sans jeton Blob : photos pas encore activées, rien n'est écrit sur le disque", async () => {
    process.env.VERCEL = "1";
    await expect(savePhoto("abc123", photo)).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE", message: expect.stringContaining("pas encore activées") });
    await expect(readFile(path.join(dir, "abc123.webp"))).rejects.toThrow();
  });

  it("Vercel Blob qui refuse l'enregistrement : message utilisateur, cause dans les journaux", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "jeton-de-test";
    blob.put.mockRejectedValue(new Error("Cannot use private access on a public store"));
    await expect(savePhoto("abc123", photo)).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE", message: expect.not.stringContaining("public store") });
    expect(console.error).toHaveBeenCalled();
  });

  it("lecture ou suppression en panne : pas d'exception (photo absente, suppression ignorée)", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "jeton-de-test";
    blob.get.mockRejectedValue(new Error("réseau"));
    blob.del.mockRejectedValue(new Error("réseau"));
    expect(await readPhoto("abc123")).toBeNull();
    await expect(deletePhoto("abc123")).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledTimes(2);
  });
});

describe("avec un jeton Vercel Blob", () => {
  beforeEach(() => {
    process.env.BLOB_READ_WRITE_TOKEN = "jeton-de-test";
  });

  it("enregistre en accès PRIVÉ, sous un nom fixe, en remplaçant l'ancienne photo", async () => {
    await savePhoto("abc123", photo);
    expect(blob.put).toHaveBeenCalledWith("avatar/abc123.webp", photo, {
      access: "private",
      allowOverwrite: true,
      addRandomSuffix: false,
      contentType: "image/webp",
    });
  });

  it("relit la photo sans cache et renvoie son contenu", async () => {
    blob.get.mockResolvedValue({ statusCode: 200, stream: new Response(photo).body });
    const out = await readPhoto("abc123");
    expect(out?.equals(photo)).toBe(true);
    expect(blob.get).toHaveBeenCalledWith("avatar/abc123.webp", { access: "private", useCache: false });
  });

  it("photo absente : null", async () => {
    blob.get.mockResolvedValue(null);
    expect(await readPhoto("abc123")).toBeNull();
  });

  it("supprime la photo distante", async () => {
    await deletePhoto("abc123");
    expect(blob.del).toHaveBeenCalledWith("avatar/abc123.webp");
  });

  it("ne touche pas au dossier local", async () => {
    await savePhoto("abc123", photo);
    await expect(readFile(path.join(dir, "abc123.webp"))).rejects.toThrow();
  });
});
