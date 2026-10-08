/** État renvoyé par une Server Action de formulaire (useActionState). */
export type FormState = {
  /** Erreur par champ. */
  errors?: Record<string, string>;
  /** Erreur ou information globale. */
  message?: string;
  /** Vrai quand l'action a réussi (les formulaires en panneau se referment). */
  ok?: boolean;
  /** Valeurs à réafficher (jamais les mots de passe). */
  values?: Record<string, string>;
};

export const initialFormState: FormState = {};
