"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current-user";
import { idSchema } from "@/lib/validation/team";
import { DomainError } from "@/server/errors";
import { placePrediction } from "@/server/predictions";
import { isTournamentMatch, placeTournamentPrediction } from "@/server/tournament-predictions";
import type { FormState } from "./types";

const schema = z.object({
  matchId: idSchema,
  side: z.enum(["HOME", "AWAY"], { error: "Choisissez un joueur" }),
  committedAces: z.coerce
    .number({ error: "Montant invalide" })
    .int({ error: "Un nombre entier d'Aces" })
    .min(10, { error: "Minimum 10 Aces" })
    .max(1_000_000_000, { error: "Montant trop élevé" }),
});

export async function placePredictionAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const raw = { matchId: fd.get("matchId"), side: fd.get("side"), committedAces: fd.get("committedAces") };
  const values = {
    committedAces: typeof raw.committedAces === "string" ? raw.committedAces : "",
    side: typeof raw.side === "string" ? raw.side : "",
  };
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[String(i.path[0])] ??= i.message;
    return { errors, values };
  }
  try {
    // Le même formulaire sert aux matchs d'interclubs et aux matchs de tournoi.
    if (await isTournamentMatch(parsed.data.matchId)) await placeTournamentPrediction(user.id, parsed.data);
    else await placePrediction(user.id, parsed.data);
  } catch (e) {
    if (e instanceof DomainError) return { message: e.message, values };
    throw e;
  }
  refresh();
  return { message: "Pronostic enregistré.", ok: true };
}
