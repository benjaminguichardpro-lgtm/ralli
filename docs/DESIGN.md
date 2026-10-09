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
- **Source** : palette de couleurs de la démo Ralli (feuille de style du 8 octobre 2026), choisie par Benjamin.
- **Approche** : restreinte, tout en verts avec une touche d'or. L'or est réservé à ce sur quoi on peut agir (sur fond vert) et aux repères (sur fond clair).
- **Vert Ralli (couleur principale)** `#1c5b3c` — token `brand` : en-tête, bandeaux.
- **Vert action** `#17503a` — token `primary` : boutons, cotes sélectionnées, onglet actif, liens, titres.
- **Vert nuit** `#0b2c1d` — token `primary-dark` : prochaine rencontre, panneau de pronostic, solde. (Teinte « bas du dégradé story » de la palette.)
- **Or sur fond vert** `#e6c872` — token `gold` : cote sélectionnée, bouton « Valider mon ralli », gain, touches trophée. Jamais sur fond clair (ratio 1,6).
- **Or sur fond clair** `#9a6f12` — token `accent` : heures des rencontres, CTA secondaires, bordures d'alerte. Texte seulement sur carte blanche (ratio 4,5).
- **Terre battue de Roland-Garros** `#b4502b` — token `clay` (texte `on-clay` blanc, ratio 5,1) : remplissage de la case du joueur touché, avant l'ouverture du panneau de pronostic.
- **Rouge « danger »** `#b3261e` — tokens `danger` et `on-danger` (ratio 6,5 sur carte blanche) : croix d'archivage des rencontres, messages d'erreur de ces boutons.
- **Vert « gagné »** `#2b7a4b` — tokens `success` et `success-ink`.
- **Vert pâle** `#e2efe5` — token `pale` : fonds d'encadrés et d'étiquettes.
- **Fond de page** `#f3f7f3` (`canvas`), cartes `#ffffff` (`surface`), bordures `#b9cbbd` (`line`).
- **Texte** `#14281d` (`ink`), texte secondaire `#46594d` (`ink-muted`), texte secondaire sur vert `#b9cbbd` (`on-primary-soft`).
- **Mode sombre** : pas implémenté. Valeurs de la palette, réservées : fond `#0c1912`, boutons et accents `#7fdba6`. Il manque des choix (cartes, texte, bordures) à décider avant de le coder.
- **Images story** (futur partage) : dégradé `#1f6443` (haut) vers `#0b2c1d` (bas), pastille « gagné » `#4fbf80`. Non utilisées dans l'app.
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
- **Case touchée** : elle se remplit de gauche à droite de terre battue (350 ms), le nom et la cote passent en blanc au fur et à mesure, puis le panneau de pronostic monte. La case reste pleine tant que le panneau est ouvert et se vide à sa fermeture (Annuler, Échap, fond). Avec « réduire les animations » : case pleine et panneau ouvert immédiatement.

## Parcours clé
Accueil (une carte par rencontre, la prochaine en grand) → toucher la carte → page de la rencontre (simples et cotes) → toucher une cote → panneau (montants 50 / 100 / 250 / Tout ou champ libre, récapitulatif) → « Valider mon ralli ». Définitif une fois validé. L'accueil n'affiche ni joueurs ni cotes : il sert à repérer l'heure de la rencontre.

## Decisions Log
| Date | Décision | Rationale |
|------|----------|-----------|
| 2026-10-08 | Création initiale | /design avec Benjamin : sobre, intuitif, hyper simple, joueurs d'abord. Maquette validée : `docs/design-preview.html`. |
| 2026-10-09 | Remplissage terre battue de la case touchée | Demande de Benjamin : `#b4502b` (terre battue orangée), sens gauche-droite, 350 ms, texte blanc, case pleine tant que le panneau est ouvert, instantané en « réduire les animations ». |
| 2026-10-09 | Accueil = cartes de rencontre seulement | Demande de Benjamin : pour pronostiquer, on touche la carte ; les cotes sont sur la page de la rencontre. Une rencontre n'apparaît qu'une fois. |
| 2026-10-08 | Palette de couleurs de la démo Ralli (vert Ralli, vert action, or) | Choix de Benjamin (remplace vert Wimbledon, terre battue, jaune balle, crème). `ball` renommé `gold`, ajout de `brand` et `pale`. Mode sombre non implémenté. |
| 2026-10-08 | Polices : Norican, Cormorant Garamond, DM Sans | Choix de Benjamin (remplace Fraunces, DM Sans, Geist). Cotes en DM Sans ; Cormorant pour les titres, noms et grands chiffres. |
| 2026-10-08 | Pas de sélecteur de club actif | Classement et Club mènent au club s'il n'y en a qu'un, sinon à une liste. Plus simple, rien à mémoriser. |
