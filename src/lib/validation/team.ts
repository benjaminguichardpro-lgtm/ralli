import { z } from "zod";
import { FftRank } from "@/generated/prisma/enums";

export const idSchema = z.string().min(1).max(64);

const teamNameSchema = z
  .string({ error: "Nom requis" })
  .trim()
  .min(2, { error: "Au moins 2 caractères" })
  .max(40, { error: "Au plus 40 caractères" });

const externalClubNameSchema = z
  .string({ error: "Nom du club adverse requis" })
  .trim()
  .min(2, { error: "Au moins 2 caractères" })
  .max(60, { error: "Au plus 60 caractères" });

const personNamePart = (label: string) =>
  z
    .string({ error: `${label} requis` })
    .trim()
    .normalize("NFC")
    .min(1, { error: `${label} requis` })
    .max(40, { error: "Au plus 40 caractères" })
    .regex(/^[\p{L}][\p{L}' -]*$/u, { error: "Lettres, espace, apostrophe ou tiret uniquement" })
    .transform((s) => s.replace(/\s+/g, " "));

export const playerInputSchema = z.object({
  firstName: personNamePart("Prénom"),
  lastName: personNamePart("Nom"),
  fftRank: z.enum(FftRank, { error: "Niveau FFT invalide" }),
});
export type PlayerInput = z.infer<typeof playerInputSchema>;

export const createTeamSchema = z.object({
  clubId: idSchema,
  name: teamNameSchema,
  captainUserId: z.string({ error: "Choisissez un capitaine" }).min(1, { error: "Choisissez un capitaine" }).max(64),
});

export const createExternalTeamSchema = z.object({
  clubId: idSchema,
  name: teamNameSchema,
  externalClubName: externalClubNameSchema,
});
