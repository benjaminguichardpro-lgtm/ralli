import { z } from "zod";

export const PASSWORD_MIN = 10;
/** Phrase d'aide affichée sous les champs « mot de passe » à l'inscription et au changement. */
export const PASSWORD_HINT = `Au moins ${PASSWORD_MIN} caractères, dont une majuscule et un symbole (! ? # - _ …).`;
// bcrypt ignore tout ce qui dépasse 72 octets : on refuse plutôt que de tronquer en silence.
const PASSWORD_MAX_BYTES = 72;

const DISPLAY_NAME_MIN = 3;
const DISPLAY_NAME_MAX = 20;
const DISPLAY_NAME_RE = /^[\p{L}\p{N} ._-]+$/u;

export const emailSchema = z
  .string({ error: "Email requis" })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Email invalide" }));

const passwordSchema = z
  .string({ error: "Mot de passe requis" })
  .min(PASSWORD_MIN, { error: `Au moins ${PASSWORD_MIN} caractères` })
  .refine((p) => /\p{Lu}/u.test(p), { error: "Il faut au moins une majuscule" })
  .refine((p) => /[^\p{L}\p{N}\s]/u.test(p), { error: "Il faut au moins un symbole (! ? # - _ …)" })
  .refine((p) => new TextEncoder().encode(p).length <= PASSWORD_MAX_BYTES, {
    error: "Mot de passe trop long",
  });

const displayNameSchema = z
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
});
export type SignUpInput = z.infer<typeof signUpSchema>;

/** Formulaire d'inscription : les mêmes champs, plus la confirmation du mot de passe. */
export const signUpFormSchema = signUpSchema
  .extend({ confirm: z.string() })
  .refine((v) => v.password === v.confirm, { error: "Les deux mots de passe diffèrent", path: ["confirm"] });

/** Connexion : un seul champ, email ou pseudo. Un email contient « @ », jamais un pseudo (voir DISPLAY_NAME_RE). */
export const signInSchema = z.object({
  identifier: z.string({ error: "Email ou pseudo requis" }).trim().min(1, { error: "Email ou pseudo requis" }).max(254, { error: "Email ou pseudo invalide" }),
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

/** Premier message d'erreur par champ, pour l'affichage dans les formulaires. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_");
    out[key] ??= issue.message;
  }
  return out;
}

/** Identifiant de connexion → critère de recherche du compte. null si le texte ne peut être ni un email ni un pseudo. */
export function loginLookup(identifier: string): { email: string } | { displayNameKey: string } | null {
  if (identifier.includes("@")) {
    const email = emailSchema.safeParse(identifier);
    return email.success ? { email: email.data } : null;
  }
  const name = displayNameSchema.safeParse(identifier);
  return name.success ? { displayNameKey: displayNameKey(name.data) } : null;
}
