"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current-user";
import { DomainError } from "@/server/errors";
import { addStoryToWall, createStory, deleteCollection, deleteStory, markStoryViewed, removeStoryFromWall, setCollectionPinned } from "@/server/stories";
import type { FormState } from "./types";

const idSchema = z.string().min(1).max(64);

export async function createStoryAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const values = {
    clubId: String(fd.get("clubId") ?? ""),
    teamId: String(fd.get("teamId") ?? ""),
    body: String(fd.get("body") ?? ""),
    background: String(fd.get("background") ?? ""),
  };
  try {
    await createStory(user.id, { ...values, teamId: values.teamId || null, onWall: fd.get("onWall") === "on", collectionId: String(fd.get("collectionId") ?? "") || null, collectionName: String(fd.get("collectionName") ?? "") });
  } catch (e) {
    if (e instanceof DomainError) return { message: e.message, values };
    throw e;
  }
  refresh();
  return { message: "Story publiée. Elle reste visible 24 h.", ok: true };
}

/** Appelée par le lecteur plein écran quand une story s'affiche. Silencieuse : une erreur ne doit jamais gêner la lecture. */
export async function markStoryViewedAction(storyId: string): Promise<void> {
  const user = await requireUser();
  const parsed = idSchema.safeParse(storyId);
  if (!parsed.success) return;
  await markStoryViewed(user.id, parsed.data);
}

export async function deleteStoryAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = idSchema.safeParse(fd.get("storyId"));
  if (!parsed.success) return { message: "Requête invalide" };
  try {
    await deleteStory(user.id, parsed.data);
  } catch (e) {
    if (e instanceof DomainError) return { message: e.message };
    throw e;
  }
  refresh();
  return { ok: true };
}

export async function setCollectionPinnedAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = idSchema.safeParse(fd.get("collectionId"));
  if (!parsed.success) return { message: "Requête invalide" };
  try {
    await setCollectionPinned(user.id, parsed.data, fd.get("pinned") === "true");
  } catch (e) {
    if (e instanceof DomainError) return { message: e.message };
    throw e;
  }
  refresh();
  return { ok: true };
}

export async function deleteCollectionAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = idSchema.safeParse(fd.get("collectionId"));
  if (!parsed.success) return { message: "Requête invalide" };
  try {
    await deleteCollection(user.id, parsed.data);
  } catch (e) {
    if (e instanceof DomainError) return { message: e.message };
    throw e;
  }
  refresh();
  return { ok: true };
}

export async function addStoryToWallAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = idSchema.safeParse(fd.get("storyId"));
  if (!parsed.success) return { message: "Requête invalide" };
  const collectionId = String(fd.get("collectionId") ?? "") || null;
  const collectionName = String(fd.get("collectionName") ?? "");
  try {
    await addStoryToWall(user.id, parsed.data, { collectionId, collectionName });
  } catch (e) {
    if (e instanceof DomainError) return { message: e.message, values: { collectionName } };
    throw e;
  }
  refresh();
  return { message: "Ajoutée à la une du club.", ok: true };
}

export async function removeStoryFromWallAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = idSchema.safeParse(fd.get("storyId"));
  if (!parsed.success) return { message: "Requête invalide" };
  try {
    await removeStoryFromWall(user.id, parsed.data);
  } catch (e) {
    if (e instanceof DomainError) return { message: e.message };
    throw e;
  }
  refresh();
  return { message: "Retirée de la une du club.", ok: true };
}
