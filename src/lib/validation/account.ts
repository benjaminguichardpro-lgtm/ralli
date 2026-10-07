import { z } from "zod";

export const PASSWORD_MIN = 8;
// bcrypt ignore tout ce qui dépasse 72 octets : on refuse plutôt que de tronquer en silence.
export const PASSWORD_MAX_BYTES = 72;

export const DISPLAY_NAME_MIN = 3;
export const DISPLAY_NAME_MAX = 20;
const DISPLAY_NAME_RE = /^[\p{L}\p{N} ._-]+$/u;

export const emailSchema = z
  .string({ error: "Email requis" })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Email invalide" }));

export const passwordSchema = z
  .string({ error: "Mot de passe requis" })
  .min(PASSWORD_MIN, { error: `Au moins ${PASSWORD_MIN} caractères` })
  .refine((p) => new TextEncoder().encode(p).length <= PASSWORD_MAX_BYTES, {
    error: "Mot de passe trop long",
  });

export const displayNameSchema = z
  .string({ error: "Pseudo requis" })
  .trim()
  .normalize("NFC")
  .min(DISPLAY_NAME_MIN, { error: `Au moins ${DISPLAY_NAME_MIN} caractères` })
  .max(DISPLAY_NAME_MAX, { error: `Au plus ${DISPLAY_NAME_MAX} caractères` })
  .regex(DISPLAY_NAME_RE, { error: "Lettres, chiffres, espace, point, tiret ou tiret bas uniquement" })
  .transform((s) => s.replace(/\s+/g, " "));

/** Clé d'unicité du pseudo, insensible à la casse. */
export function displayNameKey(displayName: string): string {
  return displayName.toLocaleLowerCase("fr-FR");
}

export const signUpSchema = z.object({
  email: emailSchema,
  displayName: displayNameSchema,
  password: passwordSchema,
  // Case à cocher HTML : "on" si cochée, absente sinon.
  ageConfirmed: z.literal("on", { error: "Vous devez avoir 18 ans ou plus pour vous inscrire" }),
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: "Mot de passe requis" }),
});

export const changePasswordSchema = z
  .object({
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { error: "Les deux mots de passe diffèrent", path: ["confirm"] });

export const clubNameSchema = z
  .string({ error: "Nom requis" })
  .trim()
  .min(2, { error: "Au moins 2 caractères" })
  .max(60, { error: "Au plus 60 caractères" });

export const inviteCodeInputSchema = z
  .string({ error: "Code requis" })
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{6}$/, { error: "Le code fait 6 caractères" });

/** Premier message d'erreur par champ, pour l'affichage dans les formulaires. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_");
    out[key] ??= issue.message;
  }
  return out;
}
