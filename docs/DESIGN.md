# Design System — Ralli

## Product Context
- **Quoi** : application mobile de pronostics entre amis sur les interclubs de tennis amateur, en Aces (monnaie fictive, sans valeur).
- **Pour qui** : les membres d'un club (joueurs qui pronostiquent en priorité), puis capitaines et admins qui composent les rencontres.
- **Espace** : tennis de club ; inspiration de clarté des applications de pronostics sportifs, sans leurs mécaniques d'incitation.
- **Type** : web app mobile-first.
- **Memorable thing** : « Je vois à quelle heure joue mon club, et je pronostique en trois gestes. »

## Aesthetic Direction
- **Direction** : sobre et sportif, tableau d'affichage de club-house (crème, vert profond, chiffres nets).
- **Décoration** : minimale. La typographie et la couleur font le travail.
- **Mood** : clair, calme, sans pression. Pas de compte à rebours, pas d'effet « casino ».
- **Garde-fou** : on reprend la clarté des applications de pronostics (cote en gros bouton, panneau du bas), pas leurs mécaniques qui poussent à jouer plus.

## Typography
- **Logo** : Norican (400) — manuscrite, effet pinceau, uniquement le mot « Ralli » de l'en-tête.
- **Titres, noms, grands chiffres** : Cormorant Garamond (600, 700) — serif élégante, chiffres alignés sur la ligne de base.
- **Texte, boutons, cotes, menus** : DM Sans (400, 500, 700), chiffres tabulaires pour les cotes, le solde et les montants. Un texte demandé en 600 s'affiche en 700.
- **Polices de secours** : Brush Script MT, cursive (logo) ; Georgia, Times New Roman, serif (titres) ; -apple-system, system-ui, Segoe UI, sans-serif (texte).
- **Licence** : SIL Open Font License (usage commercial autorisé), toutes trois gratuites sur Google Fonts.
- **Loading** : `next/font/google` (Norican, Cormorant Garamond, DM Sans), seules les graisses utilisées sont chargées.
- **Scale** : 12 / 14 / 16 / 18 / 20 / 24 / 32 / 44 px (l'heure de la prochaine rencontre est le plus grand élément de l'accueil).

## Color
- **Approche** : restreinte. Un seul élément jaune : ce sur quoi on peut agir.
- **Primary** : `#1b4d3e` vert Wimbledon — en-tête, boutons, contours des cotes.
- **Primary dark** : `#123629` vert nuit — carte « prochaine rencontre », panneau de pronostic.
- **Ball** : `#dfec3a` jaune balle — cote sélectionnée sur fond vert, bouton « Valider ». Jamais seul sur blanc (ratio 1,3).
- **Accent** : `#c4501b` terre battue — heures des rencontres, appels secondaires.
- **Neutrals** : crème `#f5efe0` (fond), blanc `#ffffff` (cartes), encre `#1f2421`, gris encre `#5a5a52`.
- **Semantic** : succès `#5e9c4b` (fond) / `#3d7030` (texte).
- **Dark mode** : aucun au MVP.
- **Règle** : couleurs uniquement via les tokens de `src/app/globals.css`, combinaisons déclarées dans `src/lib/theme/contrast.ts` et vérifiées par `npm run contrast`.

## Spacing
- **Base** : 4 px, confortable.
- **Cibles tactiles** : 48 px pour les cotes et les montants rapides, 44 px minimum ailleurs.

## Layout
- **Approche** : une colonne mobile (36 rem maximum), cartes à coins arrondis, navigation fixe en bas.
- **Navigation** : Matchs, Classement, Portefeuille, Club (barre du bas, connecté uniquement). Le solde est toujours visible en haut.
- **Radius** : md 12 px, lg 16 px, panneau 24 px, pastilles pleines.

## Motion
- **Approche** : minimale et fonctionnelle. Le panneau monte en 250 ms. Rien ne clignote. Respecte `prefers-reduced-motion`.

## Parcours clé
Accueil (fil des simples) → toucher une cote → panneau (montants 50 / 100 / 250 / Tout ou champ libre, récapitulatif) → « Valider mon ralli ». Définitif une fois validé.

## Decisions Log
| Date | Décision | Rationale |
|------|----------|-----------|
| 2026-10-08 | Création initiale | /design avec Benjamin : sobre, intuitif, hyper simple, joueurs d'abord. Maquette validée : `docs/design-preview.html`. |
| 2026-10-08 | Polices : Norican, Cormorant Garamond, DM Sans | Choix de Benjamin (remplace Fraunces, DM Sans, Geist). Cotes en DM Sans ; Cormorant pour les titres, noms et grands chiffres. |
| 2026-10-08 | Pas de sélecteur de club actif | Classement et Club mènent au club s'il n'y en a qu'un, sinon à une liste. Plus simple, rien à mémoriser. |
