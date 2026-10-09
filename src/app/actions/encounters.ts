"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { fieldErrors } from "@/lib/validation/account";
import {
  cancelReasonSchema,
  createEncounterSchema,
  doublesSetupSchema,
  singlesSetupSchema,
  parisDateTimeSchema,
} from "@/lib/validation/encounter";
import { idSchema } from "@/lib/validation/team";
import {
  addMatch,
  archiveEncounter,
  cancelEncounter,
  createEncounter,
  deleteDraft,
  publishEncounter,
  removeMatch,
  replaceMatch,
  rescheduleEncounter,
  unarchiveEncounter,
} from "@/server/encounters";
import { DomainError } from "@/server/errors";
import type { FormState } from "./types";

const get = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : undefined;
};

async function run(fn: () => Promise<unknown>, okMessage?: string): Promise<FormState> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof DomainError) return { message: e.message };
    throw e;
  }
  refresh();
  return okMessage ? { message: okMessage } : {};
}

const refundNote = (n: number) => (n > 0 ? ` ${n} pronostic${n > 1 ? "s" : ""} remboursé${n > 1 ? "s" : ""}.` : "");

export async function createEncounterAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const raw = { clubTeamId: get(fd, "clubTeamId"), opponentTeamId: get(fd, "opponentTeamId"), venue: get(fd, "venue"), startsAt: get(fd, "startsAt") };
  const values = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v ?? ""]));
  const parsed = createEncounterSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  let id = "";
  try {
    ({ id } = await createEncounter(user.id, { ...parsed.data, clubTeamIsHome: parsed.data.venue === "home" }));
  } catch (e) {
    if (e instanceof DomainError) return { message: e.message, values };
    throw e;
  }
  redirect(`/rencontres/${id}`);
}

/** Lit le formulaire d'un match : double si le champ « second joueur » est présent, simple sinon. */
function readSetup(fd: FormData) {
  const raw = {
    homePlayerId: get(fd, "homePlayerId"),
    awayPlayerId: get(fd, "awayPlayerId"),
    homePlayer2Id: get(fd, "homePlayer2Id"),
    awayPlayer2Id: get(fd, "awayPlayer2Id"),
    points: get(fd, "points"),
  };
  const isDouble = fd.has("homePlayer2Id") || fd.has("awayPlayer2Id");
  return isDouble ? doublesSetupSchema.safeParse(raw) : singlesSetupSchema.safeParse({ ...raw, homePlayer2Id: undefined, awayPlayer2Id: undefined });
}

export async function addMatchAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const encounterId = idSchema.safeParse(get(fd, "encounterId"));
  const setup = readSetup(fd);
  if (!encounterId.success) return { message: "Requête invalide" };
  if (!setup.success) return { errors: fieldErrors(setup.error) };
  const isDouble = "homePlayer2Id" in setup.data;
  return run(() => addMatch(user.id, encounterId.data, setup.data), isDouble ? "Double ajouté." : "Match ajouté.");
}

export async function replaceMatchAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const matchId = idSchema.safeParse(get(fd, "matchId"));
  const setup = readSetup(fd);
  if (!matchId.success) return { message: "Requête invalide" };
  if (!setup.success) return { errors: fieldErrors(setup.error) };
  let refunded = 0;
  const r = await run(async () => {
    ({ refunded } = await replaceMatch(user.id, matchId.data, setup.data));
  });
  return r.message ? r : { message: `Match modifié.${refundNote(refunded)}` };
}

export async function removeMatchAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const matchId = idSchema.safeParse(get(fd, "matchId"));
  if (!matchId.success) return { message: "Requête invalide" };
  let refunded = 0;
  const r = await run(async () => {
    ({ refunded } = await removeMatch(user.id, matchId.data));
  });
  return r.message ? r : { message: `Match retiré.${refundNote(refunded)}` };
}

export async function publishAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = idSchema.safeParse(get(fd, "encounterId"));
  if (!id.success) return { message: "Requête invalide" };
  return run(() => publishEncounter(user.id, id.data), "Rencontre publiée : les pronostics sont ouverts.");
}

export async function rescheduleAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = idSchema.safeParse(get(fd, "encounterId"));
  const startsAt = parisDateTimeSchema.safeParse(get(fd, "startsAt"));
  if (!id.success) return { message: "Requête invalide" };
  if (!startsAt.success) return { errors: { startsAt: startsAt.error.issues[0]?.message ?? "Date invalide" } };
  return run(() => rescheduleEncounter(user.id, id.data, startsAt.data), "Nouvelle date enregistrée.");
}

export async function cancelAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = idSchema.safeParse(get(fd, "encounterId"));
  const reason = cancelReasonSchema.safeParse(get(fd, "reason"));
  if (!id.success) return { message: "Requête invalide" };
  if (!reason.success) return { errors: { reason: reason.error.issues[0]?.message ?? "Motif invalide" } };
  let refunded = 0;
  const r = await run(async () => {
    ({ refunded } = await cancelEncounter(user.id, id.data, reason.data));
  });
  return r.message ? r : { message: `Rencontre annulée.${refundNote(refunded)}` };
}

export async function deleteDraftAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = idSchema.safeParse(get(fd, "encounterId"));
  if (!id.success) return { message: "Requête invalide" };
  let clubId = "";
  try {
    ({ clubId } = await deleteDraft(user.id, id.data));
  } catch (e) {
    if (e instanceof DomainError) return { message: e.message };
    throw e;
  }
  redirect(`/clubs/${clubId}`);
}

export async function archiveEncounterAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = idSchema.safeParse(get(fd, "encounterId"));
  if (!id.success) return { message: "Requête invalide" };
  return run(() => archiveEncounter(user.id, id.data));
}

export async function unarchiveEncounterAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = idSchema.safeParse(get(fd, "encounterId"));
  if (!id.success) return { message: "Requête invalide" };
  return run(() => unarchiveEncounter(user.id, id.data));
}
