"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/current-user";
import { FFT_RANKS } from "@/lib/fft";
import { type MatchResult, ScoreError, parseSets } from "@/lib/scores/result";
import { InvalidLocalTimeError, parseParisLocal } from "@/lib/time";
import { idSchema } from "@/lib/validation/team";
import { DomainError } from "@/server/errors";
import {
  type FirstRoundPair,
  addEntry,
  addNewEntry,
  cancelTournament,
  createTournament,
  deleteDraftTournament,
  publishTournament,
  recordTournamentResult,
  removeEntry,
  setFirstRound,
  setMatchTime,
} from "@/server/tournaments";
import type { FormState } from "./types";

const get = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : undefined;
};

/** Heure saisie (datetime-local, heure de Paris) → date ; vide → null. Lève une erreur de domaine si elle est invalide. */
function readTime(raw: string | undefined): Date | null {
  if (!raw) return null;
  try {
    return parseParisLocal(raw);
  } catch (e) {
    if (e instanceof InvalidLocalTimeError) throw new DomainError("INVALID", e.message);
    throw e;
  }
}

async function run(fn: () => Promise<unknown>, ok: string, values?: Record<string, string>): Promise<FormState> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof DomainError) return { message: e.message, values };
    throw e;
  }
  refresh();
  return { message: ok, ok: true };
}

export async function createTournamentAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const clubId = idSchema.safeParse(get(fd, "clubId"));
  const values = { name: get(fd, "name") ?? "", drawSize: get(fd, "drawSize") ?? "8", startsAt: get(fd, "startsAt") ?? "" };
  if (!clubId.success) return { message: "Requête invalide", values };
  let id = "";
  try {
    const startsAt = readTime(values.startsAt);
    if (!startsAt) return { errors: { startsAt: "Date de début requise" }, values };
    ({ id } = await createTournament(user.id, clubId.data, { name: values.name, drawSize: Number(values.drawSize), startsAt }));
  } catch (e) {
    if (e instanceof DomainError) return { message: e.message, values };
    throw e;
  }
  redirect(`/tournois/${id}`);
}

export async function addEntryAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const t = idSchema.safeParse(get(fd, "tournamentId"));
  const p = idSchema.safeParse(get(fd, "playerId"));
  if (!t.success) return { message: "Requête invalide" };
  if (!p.success) return { errors: { playerId: "Choisis un joueur" } };
  return run(() => addEntry(user.id, t.data, p.data), "Joueur inscrit.");
}

export async function addNewEntryAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const t = idSchema.safeParse(get(fd, "tournamentId"));
  const rank = get(fd, "fftRank");
  const values = { firstName: get(fd, "firstName") ?? "", lastName: get(fd, "lastName") ?? "", fftRank: rank ?? "" };
  if (!t.success) return { message: "Requête invalide", values };
  const level = FFT_RANKS.find((r) => r.value === rank);
  if (!level) return { errors: { fftRank: "Choisis le niveau" }, values };
  return run(() => addNewEntry(user.id, t.data, { firstName: values.firstName, lastName: values.lastName, fftRank: level.value }), "Joueur ajouté et inscrit.", values);
}

export async function removeEntryAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const t = idSchema.safeParse(get(fd, "tournamentId"));
  const p = idSchema.safeParse(get(fd, "playerId"));
  if (!t.success || !p.success) return { message: "Requête invalide" };
  return run(() => removeEntry(user.id, t.data, p.data), "Joueur retiré.");
}

/** Tableau du premier tour : champs `home_<i>`, `away_<i>`, `time_<i>` pour chaque match i (de 0 à `slots` − 1). */
export async function setFirstRoundAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const t = idSchema.safeParse(get(fd, "tournamentId"));
  const slots = Number(get(fd, "slots"));
  if (!t.success || !Number.isInteger(slots) || slots < 1 || slots > 16) return { message: "Requête invalide" };
  const values: Record<string, string> = {};
  const pairs: FirstRoundPair[] = [];
  try {
    for (let i = 0; i < slots; i++) {
      const home = get(fd, `home_${i}`) ?? "";
      const away = get(fd, `away_${i}`) ?? "";
      const time = get(fd, `time_${i}`) ?? "";
      Object.assign(values, { [`home_${i}`]: home, [`away_${i}`]: away, [`time_${i}`]: time });
      pairs.push({ position: i, homePlayerId: home || null, awayPlayerId: away || null, startsAt: readTime(time) });
    }
  } catch (e) {
    if (e instanceof DomainError) return { message: e.message, values };
    throw e;
  }
  return run(() => setFirstRound(user.id, t.data, pairs), "Tableau enregistré.", values);
}

export async function publishTournamentAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const t = idSchema.safeParse(get(fd, "tournamentId"));
  if (!t.success) return { message: "Requête invalide" };
  return run(() => publishTournament(user.id, t.data), "Tournoi publié : les pronostics sont ouverts.");
}

export async function deleteDraftTournamentAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const t = idSchema.safeParse(get(fd, "tournamentId"));
  const clubId = idSchema.safeParse(get(fd, "clubId"));
  if (!t.success || !clubId.success) return { message: "Requête invalide" };
  try {
    await deleteDraftTournament(user.id, t.data);
  } catch (e) {
    if (e instanceof DomainError) return { message: e.message };
    throw e;
  }
  redirect(`/clubs/${clubId.data}`);
}

export async function cancelTournamentAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const t = idSchema.safeParse(get(fd, "tournamentId"));
  if (!t.success) return { message: "Requête invalide" };
  return run(() => cancelTournament(user.id, t.data), "Tournoi annulé : les pronostics sont remboursés.");
}

export async function setMatchTimeAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const m = idSchema.safeParse(get(fd, "matchId"));
  if (!m.success) return { message: "Requête invalide" };
  const values = { startsAt: get(fd, "startsAt") ?? "" };
  try {
    const startsAt = readTime(values.startsAt);
    if (!startsAt) return { errors: { startsAt: "Indique l'heure de début" }, values };
    await setMatchTime(user.id, m.data, startsAt);
  } catch (e) {
    if (e instanceof DomainError) return { message: e.message, values };
    throw e;
  }
  refresh();
  return { message: "Heure enregistrée.", ok: true, values };
}

const OUTCOMES = ["COMPLETED", "RETIRED", "WALKOVER"] as const;

export async function recordTournamentResultAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const m = idSchema.safeParse(get(fd, "matchId"));
  const outcome = get(fd, "outcome");
  const winner = get(fd, "winner");
  const values = { outcome: outcome ?? "COMPLETED", winner: winner ?? "", sets: get(fd, "sets") ?? "" };
  if (!m.success || !OUTCOMES.includes(outcome as (typeof OUTCOMES)[number])) return { message: "Requête invalide", values };
  if (winner !== "HOME" && winner !== "AWAY") return { errors: { winner: "Choisis le vainqueur" }, values };
  let sets: MatchResult["sets"];
  try {
    sets = parseSets(values.sets);
  } catch (e) {
    if (e instanceof ScoreError) return { message: e.message, values };
    throw e;
  }
  return run(() => recordTournamentResult(user.id, m.data, { outcome: outcome as MatchResult["outcome"], winnerSide: winner, sets }), "Résultat enregistré : les pronostics du match sont réglés.", values);
}
