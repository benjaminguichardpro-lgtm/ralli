import { rm } from "node:fs/promises";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { makeUser } from "../../tests/db/factories";
import { joinClub } from "./club-directory";
import { createClub, getClubView } from "./clubs";
import { getPhotoFor, resetMemberAvatar, setPresetAvatar, uploadAvatarPhoto } from "./avatars";

const png = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: "#b4502b" } }).png().toBuffer();

let admin: string, ana: string, bob: string, outsider: string, clubId: string;

beforeEach(async () => {
  [admin, ana, bob, outsider] = (await Promise.all(["Admin", "Ana", "Bob", "Dehors"].map(makeUser))) as [string, string, string, string];
  const club = await createClub(admin, "TC Avatars");
  clubId = club.id;
  for (const u of [ana, bob]) await joinClub(u, club.id);
});

afterAll(() => rm("test-results/avatar-db", { recursive: true, force: true }));

describe("avatars", () => {
  it("un compte reçoit un avatar prédéfini à l'inscription", async () => {
    const u = await db.user.findUniqueOrThrow({ where: { id: ana } });
    expect(u.avatarKey).toMatch(/^[a-z-]+$/);
    expect(u.avatarPhotoAt).toBeNull();
  });

  it("choisir un avatar prédéfini ; une clé inconnue est refusée", async () => {
    await setPresetAvatar(ana, "trophee");
    expect((await db.user.findUniqueOrThrow({ where: { id: ana } })).avatarKey).toBe("trophee");
    await expect(setPresetAvatar(ana, "../../etc/passwd")).rejects.toThrow("Avatar inconnu");
  });

  it("la photo importée est recadrée en carré 256 px WebP, et un avatar prédéfini la remplace", async () => {
    await uploadAvatarPhoto(ana, await png(800, 300));
    expect((await db.user.findUniqueOrThrow({ where: { id: ana } })).avatarPhotoAt).not.toBeNull();
    const photo = (await getPhotoFor(ana, ana))!;
    const meta = await sharp(photo).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 256, 256]);

    await setPresetAvatar(ana, "smash");
    expect((await db.user.findUniqueOrThrow({ where: { id: ana } })).avatarPhotoAt).toBeNull();
    expect(await getPhotoFor(ana, ana)).toBeNull();
  });

  it("refuse un fichier trop lourd, vide, d'un autre format ou illisible", async () => {
    await expect(uploadAvatarPhoto(ana, Buffer.alloc(5 * 1024 * 1024 + 1))).rejects.toThrow("trop lourde");
    await expect(uploadAvatarPhoto(ana, Buffer.alloc(0))).rejects.toThrow("Choisissez une photo");
    const gif = await sharp(await png(20, 20)).gif().toBuffer();
    await expect(uploadAvatarPhoto(ana, gif)).rejects.toThrow("Format non pris en charge");
    await expect(uploadAvatarPhoto(ana, Buffer.from("<svg onload=alert(1)></svg>"))).rejects.toThrow();
    expect((await db.user.findUniqueOrThrow({ where: { id: ana } })).avatarPhotoAt).toBeNull();
  });

  it("la photo n'est visible que de son propriétaire et des membres d'un club commun", async () => {
    await uploadAvatarPhoto(ana, await png(100, 100));
    expect(await getPhotoFor(bob, ana)).not.toBeNull(); // même club
    expect(await getPhotoFor(outsider, ana)).toBeNull(); // aucun club en commun
    expect(await getPhotoFor(bob, outsider)).toBeNull(); // pas de photo
  });

  it("un admin remet l'avatar par défaut d'un membre ; ni un membre ni un admin d'un autre club ne le peuvent", async () => {
    await uploadAvatarPhoto(ana, await png(100, 100));
    await expect(resetMemberAvatar(bob, clubId, ana)).rejects.toThrow("Action réservée aux admins");
    const other = await createClub(outsider, "Autre club");
    await expect(resetMemberAvatar(outsider, clubId, ana)).rejects.toThrow("Action réservée aux admins");
    await expect(resetMemberAvatar(outsider, other.id, ana)).rejects.toThrow("Membre introuvable");
    expect(await getPhotoFor(ana, ana)).not.toBeNull();

    await resetMemberAvatar(admin, clubId, ana);
    expect((await db.user.findUniqueOrThrow({ where: { id: ana } })).avatarPhotoAt).toBeNull();
    expect(await getPhotoFor(ana, ana)).toBeNull();
  });

  it("la liste des membres du club transporte l'avatar et la date de la photo", async () => {
    await setPresetAvatar(ana, "filet");
    await uploadAvatarPhoto(bob, await png(50, 50));
    const members = (await getClubView(admin, clubId)).members;
    expect(members.find((m) => m.userId === ana)).toMatchObject({ avatarKey: "filet", avatarPhotoAt: null });
    expect(members.find((m) => m.userId === bob)?.avatarPhotoAt).toBeInstanceOf(Date);
  });
});
