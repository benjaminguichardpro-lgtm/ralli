// Couleurs de l'affiche en image (PNG). Une image fabriquée côté serveur ne peut pas lire les variables CSS de `globals.css` :
// ces valeurs en sont la copie, SEULE exception à la règle « aucune couleur en dur ». Un test (`poster-colors.test.ts`) vérifie
// qu'elles restent identiques aux jetons de `globals.css` : changer une couleur de la charte oblige à changer ce fichier.

export const POSTER_COLORS = {
  brand: "#1c5b3c", // bandeau, cases du vainqueur
  primary: "#17503a",
  "primary-dark": "#0b2c1d", // fin du dégradé du bandeau
  "on-primary": "#ffffff",
  "on-primary-soft": "#b9cbbd",
  gold: "#e6c872", // or sur fond vert
  accent: "#9a6f12", // or sur fond clair
  line: "#b9cbbd",
  pale: "#e2efe5", // cases des matchs
  canvas: "#f3f7f3", // fond de l'affiche
  surface: "#ffffff",
  "success-ink": "#2b7a4b",
  ink: "#14281d",
  "ink-muted": "#46594d",
} as const;

