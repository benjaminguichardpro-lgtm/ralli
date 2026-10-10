"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current-user";
import { fieldErrors } from "@/lib/validation/account";
import { createExternalTeamSchema, createTeamSchema, idSchema, playerInputSchema } from "@/lib/validation/team";
import { DomainError } from "@/server/errors";
import {
  addExistingPlayerToTeam,
  addNewPlayerToTeam,
  createExternalTeam,
  createTeam,
  deletePlayer,
  removePlayerFromTeam,
  setPlayerAccount,
  setTeamCaptain,
  updatePlayer,
} from "@/server/teams";
import type { FormState } from "./types";

const fd2obj = (fd: FormData, keys: string[]) => Object.fromEntries(keys.map((k) => [k, fd.get(k) ?? undefined]));
const values = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "string" ? v : ""]));

/** Exécute une mutation métier : erreurs attendues → message, puis rafraîchit la page. */
async function run(fn: () => Promise<unknown>, okMessage?: string, errorField?: string): Promise<FormState> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof DomainError) return errorField ? { errors: { [errorField]: e.message } } : { message: e.message };
    throw e;
  }
  refresh();
  return okMessage ? { message: okMessage, ok: true } : {};
}

export async function createTeamAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const raw = fd2obj(fd, ["clubId", "name", "captainUserId"]);
  const parsed = createTeamSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: values(raw) };
  let teamId = "";
  const r = await run(async () => {
    teamId = (await createTeam(user.id, parsed.data.clubId, parsed.data)).id;
  }, undefined, "name");
  if (!teamId) return { ...r, values: values(raw) };
  redirect(`/equipes/${teamId}`);
}

export async function createExternalTeamAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const raw = fd2obj(fd, ["clubId", "name", "externalClubName"]);
  const parsed = createExternalTeamSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: values(raw) };
  let teamId = "";
  const r = await run(async () => {
    teamId = (await createExternalTeam(user.id, parsed.data.clubId, parsed.data)).id;
  }, undefined, "name");
  if (!teamId) return { ...r, values: values(raw) };
  redirect(`/equipes/${teamId}`);
}

export async function setCaptainAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = z.object({ teamId: idSchema, captainUserId: idSchema }).safeParse(fd2obj(fd, ["teamId", "captainUserId"]));
  if (!parsed.success) return { message: "Choisissez un capitaine" };
  return run(() => setTeamCaptain(user.id, parsed.data.teamId, parsed.data.captainUserId), "Capitaine mis à jour.");
}

export async function addNewPlayerAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const raw = fd2obj(fd, ["teamId", "firstName", "lastName", "fftRank"]);
  const teamId = idSchema.safeParse(raw.teamId);
  const parsed = playerInputSchema.safeParse(raw);
  if (!teamId.success) return { message: "Requête invalide" };
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: values(raw) };
  const r = await run(() => addNewPlayerToTeam(user.id, teamId.data, parsed.data));
  // Formulaire vidé après succès pour enchaîner les saisies.
  return r.message ? { ...r, values: values(raw) } : { message: `${parsed.data.firstName} ${parsed.data.lastName} ajouté(e) à l'équipe.`, ok: true };
}

export async function addExistingPlayerAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = z.object({ teamId: idSchema, playerId: idSchema }).safeParse(fd2obj(fd, ["teamId", "playerId"]));
  if (!parsed.success) return { message: "Choisissez un joueur" };
  return run(() => addExistingPlayerToTeam(user.id, parsed.data.teamId, parsed.data.playerId), "Joueur ajouté à l'équipe.");
}

export async function removePlayerAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = z.object({ teamId: idSchema, playerId: idSchema }).safeParse(fd2obj(fd, ["teamId", "playerId"]));
  if (!parsed.success) return { message: "Requête invalide" };
  return run(() => removePlayerFromTeam(user.id, parsed.data.teamId, parsed.data.playerId));
}

export async function updatePlayerAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const raw = fd2obj(fd, ["playerId", "firstName", "lastName", "fftRank"]);
  const playerId = idSchema.safeParse(raw.playerId);
  const parsed = playerInputSchema.safeParse(raw);
  if (!playerId.success) return { message: "Requête invalide" };
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: values(raw) };
  return run(() => updatePlayer(user.id, playerId.data, parsed.data), "Fiche mise à jour.");
}

export async function deletePlayerAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = idSchema.safeParse(fd.get("playerId"));
  if (!parsed.success) return { message: "Requête invalide" };
  return run(() => deletePlayer(user.id, parsed.data));
}

export async function setPlayerAccountAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = z
    .object({ playerId: idSchema, userId: z.union([idSchema, z.literal("")]) })
    .safeParse(fd2obj(fd, ["playerId", "userId"]));
  if (!parsed.success) return { message: "Requête invalide" };
  const target = parsed.data.userId || null;
  return run(() => setPlayerAccount(user.id, parsed.data.playerId, target), target ? "Compte lié." : "Lien retiré.");
}
