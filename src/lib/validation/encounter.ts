import { z } from "zod";
import { InvalidLocalTimeError, parseParisLocal } from "@/lib/time";
import { idSchema } from "./team";

/** Valeur d'un <input type="datetime-local">, lue en heure de Paris. */
export const parisDateTimeSchema = z.string({ error: "Date et heure requises" }).min(1, { error: "Date et heure requises" }).transform((v, ctx) => {
  try {
    return parseParisLocal(v);
  } catch (e) {
    ctx.addIssue({ code: "custom", message: e instanceof InvalidLocalTimeError ? e.message : "Date et heure invalides" });
    return z.NEVER;
  }
});

export const createEncounterSchema = z.object({
  clubTeamId: idSchema,
  opponentTeamId: z.string({ error: "Choisissez l'adversaire" }).min(1, { error: "Choisissez l'adversaire" }).max(64),
  venue: z.enum(["home", "away"], { error: "Indiquez si votre équipe reçoit ou se déplace" }),
  startsAt: parisDateTimeSchema,
});

export const matchPlayersSchema = z.object({
  homePlayerId: z.string({ error: "Choisissez le joueur domicile" }).min(1, { error: "Choisissez le joueur domicile" }).max(64),
  awayPlayerId: z.string({ error: "Choisissez le joueur extérieur" }).min(1, { error: "Choisissez le joueur extérieur" }).max(64),
});

export const cancelReasonSchema = z.string().trim().max(200, { error: "Au plus 200 caractères" }).optional();
