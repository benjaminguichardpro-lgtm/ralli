import { beforeEach, describe, expect, it } from "vitest";
import { signUpSchema } from "@/lib/validation/account";
import { registerUser } from "./accounts";
import { joinClub } from "./club-directory";
import { createClub, getClubView, listMyClubs, setMemberRole } from "./clubs";

async function user(name: string) {
  const { id } = await registerUser(
    signUpSchema.parse({ email: `${name}@club.fr`, displayName: name, password: "motdepasse" }),
  );
  return id;
}

let admin: string;
let member: string;
let outsider: string;
let club: { id: string };

beforeEach(async () => {
  admin = await user("admin");
  member = await user("membre");
  outsider = await user("exterieur");
  club = await createClub(admin, "TC Ralli");
  await joinClub(member, club.id);
});

describe("création et adhésion", () => {
  it("le créateur est ADMIN, celui qui rejoint est MEMBER", async () => {
    expect(await listMyClubs(admin)).toEqual([{ id: club.id, name: "TC Ralli", role: "ADMIN", logoUpdatedAt: null }]);
    expect(await listMyClubs(member)).toEqual([{ id: club.id, name: "TC Ralli", role: "MEMBER", logoUpdatedAt: null }]);
    expect(await listMyClubs(outsider)).toEqual([]);
  });

  it("refuse un club inconnu ou une seconde adhésion", async () => {
    await expect(joinClub(outsider, "inexistant")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(joinClub(member, club.id)).rejects.toMatchObject({ code: "ALREADY_MEMBER" });
  });

  it("un utilisateur peut appartenir à plusieurs clubs", async () => {
    const other = await createClub(outsider, "AS Voisins");
    await joinClub(member, other.id);
    expect((await listMyClubs(member)).map((c) => c.name)).toEqual(["AS Voisins", "TC Ralli"]);
  });
});

describe("cloisonnement des rôles", () => {
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

  it("un membre ne peut pas changer un rôle", async () => {
    await expect(setMemberRole(member, club.id, member, "ADMIN")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setMemberRole(member, club.id, admin, "MEMBER")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("un non-membre reçoit NOT_FOUND sur les actions admin", async () => {
    await expect(setMemberRole(outsider, club.id, member, "ADMIN")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("l'admin d'un autre club n'a aucun droit ici", async () => {
    await createClub(outsider, "AS Voisins");
    await expect(setMemberRole(outsider, club.id, member, "ADMIN")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("actions admin", () => {
  it("nommer un admin, puis lui retirer le rôle", async () => {
    await setMemberRole(admin, club.id, member, "ADMIN");
    expect((await listMyClubs(member))[0]?.role).toBe("ADMIN");
    await setMemberRole(member, club.id, admin, "ADMIN"); // désormais autorisé (aucun effet : déjà admin)
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
