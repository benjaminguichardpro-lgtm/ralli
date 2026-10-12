"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current-user";
import { clubNameSchema, fieldErrors } from "@/lib/validation/account";
import { clubRequestSchema } from "@/lib/validation/club-request";
import { createClubWithApproval, submitClubRequest } from "@/server/club-requests";
import { decideReturn, joinClub, leaveClub, removeMember, requestReturn } from "@/server/club-directory";
import { setMemberRole } from "@/server/clubs";
import { DomainError } from "@/server/errors";
import type { FormState } from "./types";

const idSchema = z.string().min(1).max(64);
const roleChangeSchema = z.object({
  clubId: idSchema,
  userId: idSchema,
  role: z.enum(["ADMIN", "MEMBER"]),
});

export async function createClubAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const name = fd.get("name");
  const parsed = z.object({ name: clubNameSchema }).safeParse({ name });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: { name: String(name ?? "") } };
  let clubId: string;
  try {
    ({ id: clubId } = await createClubWithApproval(user.id, parsed.data.name));
  } catch (e) {
    if (e instanceof DomainError) return { message: e.message, values: { name: parsed.data.name } };
    throw e;
  }
  redirect(`/clubs/${clubId}`);
}

const REQUEST_FIELDS = ["fullName", "clubName", "city", "role", "fftNumber", "website", "phone", "message"] as const;

export async function submitClubRequestAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const raw = Object.fromEntries(REQUEST_FIELDS.map((k) => [k, String(fd.get(k) ?? "")]));
  const parsed = clubRequestSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: raw };
  try {
    await submitClubRequest(user.id, parsed.data);
  } catch (e) {
    if (e instanceof DomainError) return { message: e.message, values: raw };
    throw e;
  }
  refresh();
  return { ok: true };
}

export async function setMemberRoleAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = roleChangeSchema.safeParse({
    clubId: fd.get("clubId"),
    userId: fd.get("userId"),
    role: fd.get("role"),
  });
  if (!parsed.success) return { message: "Requête invalide" };
  try {
    await setMemberRole(user.id, parsed.data.clubId, parsed.data.userId, parsed.data.role);
  } catch (e) {
    if (e instanceof DomainError) return { message: e.message };
    throw e;
  }
  refresh();
  return {};
}

/** « Rejoindre le club » : un seul bouton, sans code. La page se rafraîchit : les pronostics s'ouvrent. */
export async function joinClubButtonAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = idSchema.safeParse(fd.get("clubId"));
  if (!parsed.success) return { message: "Requête invalide" };
  try {
    await joinClub(user.id, parsed.data);
  } catch (e) {
    if (e instanceof DomainError) return { message: e.message };
    throw e;
  }
  refresh();
  return { ok: true };
}

export async function leaveClubAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = idSchema.safeParse(fd.get("clubId"));
  if (!parsed.success) return { message: "Requête invalide" };
  try {
    await leaveClub(user.id, parsed.data);
  } catch (e) {
    if (e instanceof DomainError) return { message: e.message };
    throw e;
  }
  refresh();
  return { ok: true };
}

export async function removeMemberAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = z.object({ clubId: idSchema, userId: idSchema }).safeParse({ clubId: fd.get("clubId"), userId: fd.get("userId") });
  if (!parsed.success) return { message: "Requête invalide" };
  try {
    await removeMember(user.id, parsed.data.clubId, parsed.data.userId);
  } catch (e) {
    if (e instanceof DomainError) return { message: e.message };
    throw e;
  }
  refresh();
  return { ok: true };
}

export async function requestReturnAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = idSchema.safeParse(fd.get("clubId"));
  if (!parsed.success) return { message: "Requête invalide" };
  try {
    await requestReturn(user.id, parsed.data);
  } catch (e) {
    if (e instanceof DomainError) return { message: e.message };
    throw e;
  }
  refresh();
  return { ok: true };
}

export async function decideReturnAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = z
    .object({ clubId: idSchema, userId: idSchema, decision: z.enum(["accept", "decline"]) })
    .safeParse({ clubId: fd.get("clubId"), userId: fd.get("userId"), decision: fd.get("decision") });
  if (!parsed.success) return { message: "Requête invalide" };
  try {
    await decideReturn(user.id, parsed.data.clubId, parsed.data.userId, parsed.data.decision === "accept");
  } catch (e) {
    if (e instanceof DomainError) return { message: e.message };
    throw e;
  }
  refresh();
  return { ok: true };
}
