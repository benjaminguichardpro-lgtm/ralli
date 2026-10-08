// Constantes de jeu (hors modèle de cotes, qui aura son propre fichier de config).

/** Aces crédités à l'inscription. */
export const SIGNUP_BONUS_ACES = 1000;

/** Bonus du lundi : versé si le solde est strictement inférieur au seuil. */
export const WEEKLY_BONUS_ACES = 200;
export const WEEKLY_BONUS_THRESHOLD_ACES = 500;

/** Bonus de connexion : à la première ouverture de l'app de chaque jour (heure de Paris), le jour de l'inscription excepté. */
export const DAILY_LOGIN_BONUS_ACES = 10;
/** Série de jours de connexion d'affilée donnant un bonus en plus, répété à chaque série complète. */
export const STREAK_LENGTH_DAYS = 7;
export const STREAK_BONUS_ACES = 50;
