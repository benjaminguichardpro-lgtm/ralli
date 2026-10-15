"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current-user";
import { PHOTO_MAX_BYTES } from "@/lib/avatars";
import { resetMemberAvatar, setPresetAvatar, uploadAvatarPhoto } from "@/server/avatars";
import { DomainError } from "@/server/errors";
import { setProfilePublic } from "@/server/member-profile";
import type { FormState } from "./types";

const idSchema = z.string().min(1).max(64);

export async function setAvatarPresetAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  try {
    await setPresetAvatar(user.id, String(fd.get("avatarKey") ?? ""));
  } catch (e) {
    if (e instanceof DomainError) return { message: e.message };
    throw e;
  }
  refresh();
  return { ok: true, message: "Avatar enregistré." };
}

export async function uploadAvatarAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const file = fd.get("photo");
  if (!(file instanceof File) || file.size === 0) return { message: "Choisissez une photo." };
  if (file.size > PHOTO_MAX_BYTES) return { message: "Photo trop lourde (5 Mo au maximum)." };
  try {
    await uploadAvatarPhoto(user.id, Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    if (e instanceof DomainError) return { message: e.message };
    throw e;
  }
  refresh();
  return { ok: true, message: "Photo enregistrée." };
}

export async function resetMemberAvatarAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const clubId = idSchema.safeParse(fd.get("clubId"));
  const userId = idSchema.safeParse(fd.get("userId"));
  if (!clubId.success || !userId.success) return { message: "Requête invalide" };
  try {
    await resetMemberAvatar(user.id, clubId.data, userId.data);
  } catch (e) {
    if (e instanceof DomainError) return { message: e.message };
    throw e;
  }
  refresh();
  return { ok: true, message: "Avatar remis par défaut." };
}

export async function setProfileVisibilityAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const visible = fd.get("visible") === "true";
  await setProfilePublic(user.id, visible);
  refresh();
  return { ok: true, message: visible ? "Ton profil est visible des membres de tes clubs." : "Ton profil est masqué." };
}
