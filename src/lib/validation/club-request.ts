import { z } from "zod";

const required = (label: string, max: number) =>
  z
    .string({ error: `${label} requis` })
    .trim()
    .min(2, { error: `${label} requis` })
    .max(max, { error: `Au plus ${max} caractères` });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Au plus ${max} caractères` })
    .transform((s) => (s === "" ? null : s))
    .nullable();

export const clubRequestSchema = z.object({
  fullName: required("Nom complet", 80),
  clubName: required("Nom du club", 60),
  city: required("Ville", 60),
  role: required("Fonction dans le club", 60),
  fftNumber: required("Numéro d'affiliation FFT", 30),
  website: optionalText(200).refine((v) => v === null || /^https?:\/\/\S+$/i.test(v), {
    error: "Adresse en http:// ou https://",
  }),
  phone: z
    .string({ error: "Téléphone requis" })
    .trim()
    .regex(/^[0-9+ ().-]{8,20}$/, { error: "Numéro de téléphone invalide" }),
  message: optionalText(1000),
});
export type ClubRequestInput = z.infer<typeof clubRequestSchema>;
