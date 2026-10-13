"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current-user";
import { PHOTO_MAX_BYTES } from "@/lib/avatars";
import { clubProfileSchema } from "@/lib/clubs/profile";
import { fieldErrors } from "@/lib/validation/account";
import { removeClubLogo, updateClubProfile, uploadClubLogo } from "@/server/club-profile";
import { deleteClub } from "@/server/club-delete";
import { setPublicPage } from "@/server/club-public";
import { DomainError } from "@/server/errors";
import type { FormState } from "./types";

const idSchema = z.string().min(1).max(64);
const FIELDS = ["name", "foundedYear", "licenseeCount", "address", "postalCode", "city", "websiteUrl", "description", "indoorCourts", "outdoorCourts"] as const;

export async function updateClubProfileAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const clubId = idSchema.safeParse(fd.get("clubId"));
  if (!clubId.success) return { message: "Requête invalide" };
  const values: Record<string, string> = {};
  for (const f of FIELDS) values[f] = String(fd.get(f) ?? "");
  const parsed = clubProfileSchema(new Date().getFullYear()).safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  try {
    const { located } = await updateClubProfile(user.id, clubId.data, parsed.data);
    if (located === false) {
      refresh();
      // Sans « ok » : le message reste affiché (l'admin doit corriger l'adresse), la fiche, elle, est bien enregistrée.
      return { message: "Fiche enregistrée, mais adresse non localisée sur la carte : vérifie l'adresse.", values };
    }
  } catch (e) {
    if (e instanceof DomainError) return { message: e.message, values };
    throw e;
  }
  refresh();
  return { ok: true, message: "Fiche du club enregistrée.", values };
}

export async function uploadClubLogoAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const clubId = idSchema.safeParse(fd.get("clubId"));
  const file = fd.get("logo");
  if (!clubId.success) return { message: "Requête invalide" };
  if (!(file instanceof File) || file.size === 0) return { message: "Choisis une image." };
  if (file.size > PHOTO_MAX_BYTES) return { message: "Image trop lourde (5 Mo au maximum)." };
  try {
    await uploadClubLogo(user.id, clubId.data, Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    if (e instanceof DomainError) return { message: e.message };
    throw e;
  }
  refresh();
  return { ok: true, message: "Logo enregistré." };
}

export async function removeClubLogoAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const clubId = idSchema.safeParse(fd.get("clubId"));
  if (!clubId.success) return { message: "Requête invalide" };
  try {
    await removeClubLogo(user.id, clubId.data);
  } catch (e) {
    if (e instanceof DomainError) return { message: e.message };
    throw e;
  }
  refresh();
  return { ok: true, message: "Logo retiré." };
}

export async function setPublicPageAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const clubId = idSchema.safeParse(fd.get("clubId"));
  if (!clubId.success) return { message: "Requête invalide" };
  const choice = fd.get("enabled"); // « keep » : l'adresse change, la page reste active
  const enabled = choice === "1" || choice === "keep";
  const slug = fd.get("slug");
  try {
    await setPublicPage(user.id, clubId.data, enabled, typeof slug === "string" && slug !== "" ? slug : undefined);
  } catch (e) {
    if (e instanceof DomainError) return { message: e.message, values: { slug: String(slug ?? "") } };
    throw e;
  }
  // Pas de refresh() ici : le formulaire garde son message, le client rafraîchit la page.
  return { ok: true, message: choice === "keep" ? "Adresse enregistrée." : enabled ? "Page publique activée." : "Page publique désactivée." };
}

/** Supprime le club (admins). Pas de refresh() : le club n'existe plus, le client quitte la page. */
export async function deleteClubAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const clubId = idSchema.safeParse(fd.get("clubId"));
  if (!clubId.success) return { message: "Requête invalide" };
  try {
    await deleteClub(user.id, clubId.data, String(fd.get("confirmation") ?? ""));
  } catch (e) {
    if (e instanceof DomainError) return { message: e.message };
    throw e;
  }
  return { ok: true, message: "Club supprimé." };
}
