"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current-user";
import { clubNameSchema, fieldErrors, inviteCodeInputSchema } from "@/lib/validation/account";
import { createClub, joinClubByCode, regenerateInviteCode, setMemberRole } from "@/server/clubs";
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
  const club = await createClub(user.id, parsed.data.name);
  redirect(`/clubs/${club.id}`);
}

export async function joinClubAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const code = fd.get("code");
  const values = { code: String(code ?? "") };
  const parsed = z.object({ code: inviteCodeInputSchema }).safeParse({ code });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  let clubId: string;
  try {
    ({ clubId } = await joinClubByCode(user.id, parsed.data.code));
  } catch (e) {
    if (e instanceof DomainError) return { errors: { code: e.message }, values };
    throw e;
  }
  redirect(`/clubs/${clubId}`);
}

export async function regenerateInviteCodeAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = idSchema.safeParse(fd.get("clubId"));
  if (!parsed.success) return { message: "Requête invalide" };
  try {
    await regenerateInviteCode(user.id, parsed.data);
  } catch (e) {
    if (e instanceof DomainError) return { message: e.message };
    throw e;
  }
  refresh();
  return { message: "Nouveau code généré. L'ancien ne fonctionne plus.", ok: true };
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
