import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { signUpSchema } from "@/lib/validation/account";
import { clubRequestSchema } from "@/lib/validation/club-request";
import { registerUser } from "./accounts";
import { canCreateClub, createClubWithApproval, getLatestClubRequest, submitClubRequest } from "./club-requests";

const input = clubRequestSchema.parse({
  fullName: "Alice Martin",
  clubName: "TC Test",
  city: "Lyon",
  role: "Présidente",
  fftNumber: "12345678",
  website: "",
  phone: "06 12 34 56 78",
  message: "",
});

let userId: string;

beforeEach(async () => {
  const { id } = await registerUser(signUpSchema.parse({ email: "alice@club.fr", displayName: "alice", password: "motdepasse" }));
  userId = id;
});

describe("création de club réservée aux demandes acceptées", () => {
  it("refuse sans demande", async () => {
    await expect(createClubWithApproval(userId, "Mon club")).rejects.toMatchObject({ code: "CLUB_CREATION_NOT_ALLOWED" });
  });

  it("refuse tant que la demande est en attente ou refusée", async () => {
    await submitClubRequest(userId, input);
    expect(await canCreateClub(userId)).toBe(false);
    await expect(createClubWithApproval(userId, "Mon club")).rejects.toMatchObject({ code: "CLUB_CREATION_NOT_ALLOWED" });
    await db.clubCreationRequest.updateMany({ where: { userId }, data: { status: "REFUSED", refusalReason: "Club introuvable" } });
    expect((await getLatestClubRequest(userId))?.status).toBe("REFUSED");
    await expect(createClubWithApproval(userId, "Mon club")).rejects.toMatchObject({ code: "CLUB_CREATION_NOT_ALLOWED" });
  });

  it("une seule demande en attente par compte, mais une nouvelle après un refus", async () => {
    await submitClubRequest(userId, input);
    await expect(submitClubRequest(userId, input)).rejects.toMatchObject({ code: "REQUEST_PENDING" });
    await db.clubCreationRequest.updateMany({ where: { userId }, data: { status: "REFUSED" } });
    await submitClubRequest(userId, input);
  });

  it("une demande acceptée donne droit à un seul club, dont le créateur est admin", async () => {
    await submitClubRequest(userId, input);
    await db.clubCreationRequest.updateMany({ where: { userId }, data: { status: "APPROVED", decidedAt: new Date() } });
    expect(await canCreateClub(userId)).toBe(true);
    const club = await createClubWithApproval(userId, "Mon club");
    expect((await db.clubMembership.findFirst({ where: { userId, clubId: club.id } }))?.role).toBe("ADMIN");
    expect((await getLatestClubRequest(userId))?.clubId).toBe(club.id);
    expect(await canCreateClub(userId)).toBe(false);
    await expect(createClubWithApproval(userId, "Second club")).rejects.toMatchObject({ code: "CLUB_CREATION_NOT_ALLOWED" });
  });
});
