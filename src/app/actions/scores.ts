"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth/current-user";
import { type MatchResult, ScoreError, parseSets } from "@/lib/scores/result";
import { idSchema } from "@/lib/validation/team";
import { DomainError } from "@/server/errors";
import { type MatchResultInput, confirmScore, disputeScore, proposeScore, resolveDispute, withdrawScore } from "@/server/scores";
import type { FormState } from "./types";

const get = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : undefined;
};

/** Valeurs saisies, renvoyées avec une erreur pour que React ne vide pas le formulaire. */
function valuesOf(fd: FormData): Record<string, string> {
  return Object.fromEntries([...fd.entries()].filter((e): e is [string, string] => typeof e[1] === "string" && e[0] !== "matchId"));
}

async function run(fn: () => Promise<unknown>, okMessage: string, fd?: FormData): Promise<FormState> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof DomainError) return { message: e.message, values: fd && valuesOf(fd) };
    throw e;
  }
  refresh();
  return { message: okMessage };
}

const OUTCOMES = ["COMPLETED", "RETIRED", "WALKOVER", "NOT_PLAYED"] as const;

/** Lit les champs `outcome_<id>`, `winner_<id>`, `sets_<id>` pour chaque `matchId` du formulaire. */
function readResults(fd: FormData): MatchResultInput[] | string {
  const ids = fd.getAll("matchId").filter((v): v is string => typeof v === "string");
  if (ids.length === 0) return "Requête invalide";
  const out: MatchResultInput[] = [];
  for (const matchId of ids) {
    if (!idSchema.safeParse(matchId).success) return "Requête invalide";
    const outcome = get(fd, `outcome_${matchId}`);
    if (!OUTCOMES.includes(outcome as (typeof OUTCOMES)[number])) return "Indiquez l'issue de chaque match";
    const winner = get(fd, `winner_${matchId}`);
    let sets: MatchResult["sets"];
    try {
      sets = parseSets(get(fd, `sets_${matchId}`) ?? "");
    } catch (e) {
      if (e instanceof ScoreError) return e.message;
      throw e;
    }
    out.push({
      matchId,
      outcome: outcome as MatchResult["outcome"],
      winnerSide: winner === "HOME" || winner === "AWAY" ? winner : null,
      sets,
    });
  }
  return out;
}

export async function proposeScoreAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = idSchema.safeParse(get(fd, "encounterId"));
  const results = readResults(fd);
  if (!id.success) return { message: "Requête invalide" };
  if (typeof results === "string") return { message: results, values: valuesOf(fd) };
  return run(() => proposeScore(user.id, id.data, results), "Score proposé : une autre personne doit le confirmer.", fd);
}

export async function resolveDisputeAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = idSchema.safeParse(get(fd, "encounterId"));
  const results = readResults(fd);
  if (!id.success) return { message: "Requête invalide" };
  if (typeof results === "string") return { message: results, values: valuesOf(fd) };
  return run(() => resolveDispute(user.id, id.data, results), "Litige tranché : le score est définitif.", fd);
}

async function simple(fd: FormData, fn: (userId: string, encounterId: string) => Promise<unknown>, ok: string): Promise<FormState> {
  const user = await requireUser();
  const id = idSchema.safeParse(get(fd, "encounterId"));
  if (!id.success) return { message: "Requête invalide" };
  return run(() => fn(user.id, id.data), ok);
}

export const withdrawScoreAction = async (_: FormState, fd: FormData) => simple(fd, withdrawScore, "Proposition retirée.");
export const confirmScoreAction = async (_: FormState, fd: FormData) => simple(fd, confirmScore, "Score confirmé : il est définitif.");

export async function disputeScoreAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = idSchema.safeParse(get(fd, "encounterId"));
  if (!id.success) return { message: "Requête invalide" };
  const reason = get(fd, "reason") ?? "";
  if (reason.trim().length > 300) return { errors: { reason: "Au plus 300 caractères" }, values: valuesOf(fd) };
  if (!reason.trim()) return { errors: { reason: "Indiquez le motif de la contestation" }, values: valuesOf(fd) };
  return run(() => disputeScore(user.id, id.data, reason), "Score contesté : un admin du club va trancher.", fd);
}
