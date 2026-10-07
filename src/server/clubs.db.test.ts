import { beforeEach, describe, expect, it } from "vitest";
import { signUpSchema } from "@/lib/validation/account";
import { registerUser } from "./accounts";
import {
  createClub,
  getClubView,
  joinClubByCode,
  listMyClubs,
  regenerateInviteCode,
  setMemberRole,
} from "./clubs";

async function user(name: string) {
  const { id } = await registerUser(
    signUpSchema.parse({ email: `${name}@club.fr`, displayName: name, password: "motdepasse", ageConfirmed: "on" }),
  );
  return id;
}

let admin: string;
let member: string;
let outsider: string;
let club: { id: string; inviteCode: string };

beforeEach(async () => {
  admin = await user("admin");
  member = await user("membre");
  outsider = await user("exterieur");
  club = await createClub(admin, "TC Ralli");
  await joinClubByCode(member, club.inviteCode);
});

describe("création et adhésion", () => {
  it("le créateur est ADMIN, celui qui rejoint par code est MEMBER", async () => {
    expect(await listMyClubs(admin)).toEqual([{ id: club.id, name: "TC Ralli", role: "ADMIN" }]);
    expect(await listMyClubs(member)).toEqual([{ id: club.id, name: "TC Ralli", role: "MEMBER" }]);
    expect(await listMyClubs(outsider)).toEqual([]);
  });

  it("refuse un code inconnu, mal formé, ou une seconde adhésion", async () => {
    await expect(joinClubByCode(outsider, "ZZZZZZ")).rejects.toMatchObject({ code: "INVALID_INVITE_CODE" });
    await expect(joinClubByCode(outsider, "AB0CDE")).rejects.toMatchObject({ code: "INVALID_INVITE_CODE" });
    await expect(joinClubByCode(member, club.inviteCode)).rejects.toMatchObject({ code: "ALREADY_MEMBER" });
  });

  it("un utilisateur peut appartenir à plusieurs clubs", async () => {
    const other = await createClub(outsider, "AS Voisins");
    await joinClubByCode(member, other.inviteCode);
    expect((await listMyClubs(member)).map((c) => c.name)).toEqual(["AS Voisins", "TC Ralli"]);
  });
});

describe("cloisonnement des rôles", () => {
  it("seul un admin voit le code d'invitation", async () => {
    expect((await getClubView(admin, club.id)).inviteCode).toBe(club.inviteCode);
    expect((await getClubView(member, club.id)).inviteCode).toBeNull();
  });

  it("un non-membre ne voit pas le club (même réponse qu'un club inexistant)", async () => {
    await expect(getClubView(outsider, club.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getClubView(outsider, "inexistant")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("la vue club n'expose jamais d'email", async () => {
    const view = await getClubView(admin, club.id);
    expect(JSON.stringify(view)).not.toContain("@club.fr");
    expect(view.members.map((m) => [m.displayName, m.role])).toEqual([
      ["admin", "ADMIN"],
      ["membre", "MEMBER"],
    ]);
  });

  it("un membre ne peut ni régénérer le code ni changer un rôle", async () => {
    await expect(regenerateInviteCode(member, club.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setMemberRole(member, club.id, member, "ADMIN")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setMemberRole(member, club.id, admin, "MEMBER")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("un non-membre reçoit NOT_FOUND sur les actions admin", async () => {
    await expect(regenerateInviteCode(outsider, club.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("l'admin d'un autre club n'a aucun droit ici", async () => {
    await createClub(outsider, "AS Voisins");
    await expect(regenerateInviteCode(outsider, club.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("actions admin", () => {
  it("régénérer le code invalide l'ancien", async () => {
    const fresh = await regenerateInviteCode(admin, club.id);
    expect(fresh).not.toBe(club.inviteCode);
    await expect(joinClubByCode(outsider, club.inviteCode)).rejects.toMatchObject({ code: "INVALID_INVITE_CODE" });
    await expect(joinClubByCode(outsider, fresh)).resolves.toEqual({ clubId: club.id });
  });

  it("nommer un admin, puis lui retirer le rôle", async () => {
    await setMemberRole(admin, club.id, member, "ADMIN");
    expect((await listMyClubs(member))[0]?.role).toBe("ADMIN");
    await regenerateInviteCode(member, club.id); // désormais autorisé
    await setMemberRole(member, club.id, admin, "MEMBER");
    expect((await listMyClubs(admin))[0]?.role).toBe("MEMBER");
  });

  it("le dernier admin ne peut pas perdre son rôle", async () => {
    await expect(setMemberRole(admin, club.id, admin, "MEMBER")).rejects.toMatchObject({ code: "LAST_ADMIN" });
  });

  it("on ne peut pas changer le rôle d'un non-membre", async () => {
    await expect(setMemberRole(admin, club.id, outsider, "ADMIN")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
