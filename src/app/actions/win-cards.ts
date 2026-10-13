"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current-user";
import { DomainError } from "@/server/errors";
import { dismissReports, reportStory, shareWin, toggleReaction } from "@/server/win-cards";
import type { FormState } from "./types";

const idSchema = z.string().min(1).max(64);

export async function shareWinAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const predictionId = idSchema.safeParse(fd.get("predictionId"));
  if (!predictionId.success) return { message: "Requête invalide" };
  const values = { comment: String(fd.get("comment") ?? "") };
  try {
    await shareWin(user.id, predictionId.data, values.comment);
  } catch (e) {
    if (e instanceof DomainError) return { message: e.message, values };
    throw e;
  }
  // Pas de refresh() ici : la page passerait tout de suite le ralli à « déjà partagé » et ferait disparaître la fenêtre
  // (message de réussite et bouton WhatsApp compris). La fenêtre rafraîchit la page elle-même quand on la ferme.
  return { ok: true, message: "Ta victoire est partagée avec le club pendant 24 h.", values };
}

export async function toggleReactionAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const storyId = idSchema.safeParse(fd.get("storyId"));
  if (!storyId.success) return { message: "Requête invalide" };
  try {
    await toggleReaction(user.id, storyId.data);
  } catch (e) {
    if (e instanceof DomainError) return { message: e.message };
    throw e;
  }
  refresh();
  return { ok: true };
}

export async function reportStoryAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const storyId = idSchema.safeParse(fd.get("storyId"));
  if (!storyId.success) return { message: "Requête invalide" };
  try {
    await reportStory(user.id, storyId.data, String(fd.get("reason") ?? ""));
  } catch (e) {
    if (e instanceof DomainError) return { message: e.message };
    throw e;
  }
  refresh();
  return { ok: true, message: "Merci, les admins du club ont été prévenus." };
}

export async function dismissReportsAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const storyId = idSchema.safeParse(fd.get("storyId"));
  if (!storyId.success) return { message: "Requête invalide" };
  try {
    await dismissReports(user.id, storyId.data);
  } catch (e) {
    if (e instanceof DomainError) return { message: e.message };
    throw e;
  }
  refresh();
  return { ok: true, message: "Signalement écarté." };
}
