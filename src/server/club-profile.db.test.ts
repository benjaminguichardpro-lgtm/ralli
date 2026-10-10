import { rm } from "node:fs/promises";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { clubProfileSchema } from "@/lib/clubs/profile";
import { db } from "@/lib/db";
import { makeUser } from "../../tests/db/factories";
import { createClub, getClubView, joinClubByCode, listMyClubs, setMemberRole } from "./clubs";
import { getClubLogoFor, getClubProfile, removeClubLogo, updateClubProfile, uploadClubLogo } from "./club-profile";

const png = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 4, background: "#b4502b" } }).png().toBuffer();
const input = (over: Record<string, string> = {}) => {
  const r = clubProfileSchema(2026).safeParse({ name: "TC Fiche", foundedYear: "", licenseeCount: "", address: "", postalCode: "", city: "", websiteUrl: "", description: "", indoorCourts: "", outdoorCourts: "", ...over });
  if (!r.success) throw new Error("entrée de test invalide");
  return r.data;
};

let admin: string, admin2: string, member: string, outsider: string, clubId: string;

beforeEach(async () => {
  [admin, admin2, member, outsider] = (await Promise.all(["Admin", "Admin2", "Membre", "Dehors"].map(makeUser))) as [string, string, string, string];
  const club = await createClub(admin, "TC Fiche");
  clubId = club.id;
  for (const u of [admin2, member]) await joinClubByCode(u, club.inviteCode);
  await setMemberRole(admin, clubId, admin2, "ADMIN");
});

afterAll(() => rm("test-results/avatar-db", { recursive: true, force: true }));

describe("fiche du club", () => {
  it("un club neuf a une fiche vide, lisible par ses membres", async () => {
    const p = await getClubProfile(member, clubId);
    expect(p).toMatchObject({ name: "TC Fiche", foundedYear: null, licenseeCount: null, websiteUrl: null, logoUpdatedAt: null, myRole: "MEMBER" });
  });

  it("un admin enregistre la fiche (et le nom) ; vider un champ l'efface", async () => {
    await updateClubProfile(admin, clubId, input({ name: "TC Renommé", foundedYear: "1974", licenseeCount: "250", city: "Lyon", websiteUrl: "https://tclyon.fr", indoorCourts: "2", outdoorCourts: "6", description: "Bienvenue" }));
    expect(await getClubProfile(member, clubId)).toMatchObject({ name: "TC Renommé", foundedYear: 1974, licenseeCount: 250, city: "Lyon", websiteUrl: "https://tclyon.fr", indoorCourts: 2, outdoorCourts: 6, description: "Bienvenue" });
    await updateClubProfile(admin2, clubId, input({ name: "TC Renommé", city: "Lyon" })); // tout le reste vidé
    expect(await getClubProfile(member, clubId)).toMatchObject({ foundedYear: null, licenseeCount: null, websiteUrl: null, indoorCourts: null, description: null, city: "Lyon" });
  });

  it("zéro est une valeur (0 licencié, 0 court) distincte de « non précisé »", async () => {
    await updateClubProfile(admin, clubId, input({ licenseeCount: "0", indoorCourts: "0" }));
    expect(await getClubProfile(admin, clubId)).toMatchObject({ licenseeCount: 0, indoorCourts: 0, outdoorCourts: null });
  });

  it("un membre simple ne peut rien modifier : fiche, nom, logo", async () => {
    await expect(updateClubProfile(member, clubId, input({ name: "Piraté" }))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(uploadClubLogo(member, clubId, await png(50, 50))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(removeClubLogo(member, clubId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await getClubProfile(admin, clubId)).name).toBe("TC Fiche");
  });

  it("un non-membre ne voit rien et ne peut rien modifier (même réponse qu'un club inexistant)", async () => {
    await expect(getClubProfile(outsider, clubId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(updateClubProfile(outsider, clubId, input())).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(uploadClubLogo(outsider, clubId, await png(50, 50))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getClubProfile(admin, "inexistant")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("un admin d'un autre club ne peut pas modifier celui-ci", async () => {
    const other = await createClub(outsider, "Autre club");
    await expect(updateClubProfile(outsider, clubId, input())).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(updateClubProfile(outsider, other.id, input({ name: "Autre club" }))).resolves.toBeUndefined();
  });

  it("la page du club et la liste des clubs portent la fiche et la date du logo", async () => {
    await updateClubProfile(admin, clubId, input({ city: "Lyon", licenseeCount: "80" }));
    const view = await getClubView(member, clubId);
    expect(view.profile).toMatchObject({ city: "Lyon", licenseeCount: 80, logoUpdatedAt: null });
    expect((await listMyClubs(member))[0]).toMatchObject({ id: clubId, logoUpdatedAt: null });
  });

  it("la base refuse des valeurs absurdes même sans passer par l'application", async () => {
    await expect(db.club.update({ where: { id: clubId }, data: { foundedYear: 1700 } })).rejects.toThrow();
    await expect(db.club.update({ where: { id: clubId }, data: { licenseeCount: -1 } })).rejects.toThrow();
    await expect(db.club.update({ where: { id: clubId }, data: { indoorCourts: 101 } })).rejects.toThrow();
    await expect(db.club.update({ where: { id: clubId }, data: { websiteUrl: "javascript:alert(1)" } })).rejects.toThrow();
    await expect(db.club.update({ where: { id: clubId }, data: { description: "x".repeat(501) } })).rejects.toThrow();
  });
});

describe("logo du club", () => {
  it("n'est pas recadré : un logo large reste entier, ramené à 512 px au plus, en WebP", async () => {
    await uploadClubLogo(admin, clubId, await png(1000, 400));
    const logo = (await getClubLogoFor(member, clubId))!;
    const meta = await sharp(logo).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 512, 205]);
    expect((await getClubProfile(member, clubId)).logoUpdatedAt).not.toBeNull();
  });

  it("n'agrandit pas un petit logo", async () => {
    await uploadClubLogo(admin, clubId, await png(100, 80));
    const meta = await sharp((await getClubLogoFor(admin, clubId))!).metadata();
    expect([meta.width, meta.height]).toEqual([100, 80]);
  });

  it("visible des membres seulement", async () => {
    await uploadClubLogo(admin, clubId, await png(60, 60));
    expect(await getClubLogoFor(member, clubId)).not.toBeNull();
    expect(await getClubLogoFor(outsider, clubId)).toBeNull();
  });

  it("un admin peut le retirer : plus d'image, plus de date", async () => {
    await uploadClubLogo(admin, clubId, await png(60, 60));
    await removeClubLogo(admin2, clubId);
    expect(await getClubLogoFor(member, clubId)).toBeNull();
    expect((await getClubProfile(member, clubId)).logoUpdatedAt).toBeNull();
  });

  it("refuse un fichier trop lourd, vide, d'un autre format ou illisible", async () => {
    await expect(uploadClubLogo(admin, clubId, Buffer.alloc(5 * 1024 * 1024 + 1))).rejects.toThrow("trop lourde");
    await expect(uploadClubLogo(admin, clubId, Buffer.alloc(0))).rejects.toThrow("Choisis une image");
    const gif = await sharp(await png(20, 20)).gif().toBuffer();
    await expect(uploadClubLogo(admin, clubId, gif)).rejects.toThrow("Format non pris en charge");
    await expect(uploadClubLogo(admin, clubId, Buffer.from("<svg onload=alert(1)></svg>"))).rejects.toThrow();
    expect((await getClubProfile(admin, clubId)).logoUpdatedAt).toBeNull();
  });

  it("le logo du club et la photo d'un compte ne se mélangent pas", async () => {
    await uploadClubLogo(admin, clubId, await png(60, 60));
    const { getPhotoFor } = await import("./avatars");
    expect(await getPhotoFor(admin, admin)).toBeNull(); // l'admin n'a pas de photo de profil
  });
});
