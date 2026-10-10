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
  vi.clearAllMocks();
});
afterEach(async () => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
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
