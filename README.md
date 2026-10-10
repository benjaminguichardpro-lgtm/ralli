# Ralli

Web app mobile-first de pronostics sur les interclubs de tennis amateur, en Aces (monnaie fictive, sans valeur, non achetable, non convertible).
Jeu gratuit, sans argent réel.

Stack : Next.js 16 (App Router) · TypeScript strict · Tailwind v4 · Prisma 7 · Postgres · Auth.js · zod · Vitest · Playwright.

## Démarrage

```bash
npm install                 # lance aussi `prisma generate`
npm run db:start            # démarre la base Postgres locale (prisma dev)
cp .env.example .env        # puis générer AUTH_SECRET et CRON_SECRET
npm run db:deploy           # applique les migrations
npm run db:verify           # prouve que le trigger du ledger et les CHECK sont actifs
npm run dev
```

| Commande | Rôle |
|---|---|
| `npm test` | Tests unitaires + tests d'intégration sur la base de test (Vitest) |
| `npm run test:e2e` | Tests navigateur multi-rôles (Playwright), contre `next start` et la base de test. Lancer `npm run build` avant |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Build de production |
| `npm run contrast` | Affiche les ratios de contraste du thème (lus dans `src/app/globals.css`) |
| `npm run db:start` / `db:stop` | Démarre / arrête la base locale de dev |
| `npm run db:test:start` / `db:test:stop` | Démarre / arrête la base locale de test |
| `npm run db:ls` | Liste les bases locales et leurs ports |
| `npm run odds:table` | Affiche les cotes produites par le modèle sur des cas types |
| `npm run seed:demo` | Charge la démo (3 clubs, 14 comptes, rencontres dans chaque état) dans la base **locale** de dev. `-- --reset` la refait à neuf (vide toute la base) |
| `npm run settle -- <id rencontre>` | Filet de sécurité : règle les pronostics d'une rencontre confirmée non réglée |
| `npm run reset-password -- <email>` | Dépannage : génère un mot de passe temporaire, à changer à la connexion suivante |
| `npm run db:migrate` | Crée/applique une migration (dev) |
| `npm run db:deploy` | Applique les migrations existantes |
| `npm run db:verify` | Prouve en base que le trigger du ledger et les CHECK fonctionnent (transaction annulée, rien n'est conservé) |

## Base de données

> Bases locales : `DATABASE_POOL_MAX="1"` (dans `.env` et `.env.test`) impose une seule connexion à la fois, car `prisma dev` se mélange quand plusieurs requêtes arrivent ensemble. À laisser vide avec Neon.

### Aujourd'hui : Postgres local via `prisma dev`

Pas de Docker ni de compte cloud : `npx prisma dev` lance un **vrai PostgreSQL 17** (PGlite, compilé en WebAssembly) en local. Triggers PL/pgSQL et contraintes CHECK y fonctionnent, ce qui a été vérifié avant la première migration.

- Démarrage : `npm run db:start`, qui lance `prisma dev --name ralli --detach` avec des ports fixes (51213 pour le serveur, 51214 pour la base, 51215 pour la base « shadow » des migrations).
- Arrêt : `npm run db:stop`. Les données persistent entre deux démarrages.
- `.env` : `DATABASE_URL` et `DIRECT_URL` pointent toutes deux sur `postgres://postgres:postgres@localhost:51214/template1?sslmode=disable` (voir `.env.example`). Ce sont les identifiants par défaut d'une base qui n'écoute que sur la machine locale.
- Limite connue : PGlite traite les requêtes une à une, sans vraie concurrence. Les tests de concurrence (double engagement simultané, par exemple) seront donc refaits sur un vrai Postgres avant le pilote.

### Base de test

Une seconde base locale, `ralli-test`, est réservée aux tests et **vidée à chaque test** (TRUNCATE). Démarrage : `npm run db:test:start`, puis `cp .env.test.example .env.test`. Les tests refusent de tourner si `.env.test` pointe sur la même base que `.env`.

Le port est attribué par `prisma dev` à la création du serveur (les options de port sont ignorées par la version actuelle), puis reste stable. En cas de doute : `npm run db:ls`.

### Plus tard : Neon (staging et prod)

Quand un compte Neon existera :

1. Créer un projet `ralli` en région Europe (Frankfurt), Postgres 17, avec une branche `main` (prod) et des branches enfants `dev` et `test`.
2. Pour chaque branche : `DATABASE_URL` = chaîne **poolée** (hôte en `-pooler`), `DIRECT_URL` = chaîne **directe**. L'app passe par le pooler (serverless), Prisma Migrate exige une connexion directe.
3. Appliquer les migrations avec `npm run db:deploy` (en prod : dans la commande de build Vercel).

## Authentification

- Auth.js v5, provider *credentials* (email + mot de passe), sessions JWT signées par `AUTH_SECRET`. Le JWT ne contient que l'identifiant : pseudo, rôles et drapeau « mot de passe temporaire » sont relus en base à chaque requête.
- Mots de passe hachés avec bcrypt (coût 12). Message d'erreur identique pour « email inconnu » et « mauvais mot de passe », avec un temps de réponse comparable.
- Pas d'email, donc pas de mot de passe oublié en libre-service : un opérateur lance `npm run reset-password -- <email>` et transmet le mot de passe temporaire. La personne doit le changer avant d'accéder au reste de l'app.
- `AUTH_TRUST_HOST=true` est nécessaire pour `next start` en local ; inutile sur Vercel.

## Règles métier notables

### Rôles de club
- Le créateur d'un club en est **admin**. Rejoindre par code donne le rôle **membre**.
- Seuls les admins voient le code d'invitation, le régénèrent (l'ancien cesse alors de fonctionner) et nomment ou retirent des admins. Un club garde toujours au moins un admin.
- Un non-membre qui ouvre l'URL d'un club voit « Page introuvable », exactement comme pour un club inexistant. Le statut HTTP reste 200, parce que le contrôle s'exécute dans un bloc streamé ; aucune donnée du club n'est envoyée.
- Tous ces contrôles sont faits côté serveur (`src/server/clubs.ts`), jamais seulement dans l'interface.


### Rencontres (décisions R1 à R8)
- **Adversaires** : une rencontre oppose toujours une équipe du club à une **équipe adverse de la liste du club**, que l'adversaire utilise Ralli ou non. Les deux clubs ne sont jamais liés dans l'app. La liste est alimentée par les admins et les capitaines.
- **Création** : par le capitaine de l'équipe (pour son équipe) ou un admin du club. Le créateur indique si son équipe reçoit ou se déplace, et saisit l'heure de début en heure de Paris.
- **Composition** : le créateur compose les deux côtés avec des joueurs pris dans les effectifs, en **simples** (un joueur contre un joueur) et en **doubles** (deux joueurs de chaque équipe, voir « Doubles » ci-dessous). **Aucune limite du nombre de matchs** (il dépend du niveau de la rencontre). Un joueur dispute au plus un simple et un double par rencontre.
- **Publication** (brouillon → ouverte) : au moins un match et une heure de début dans le futur. Les cotes de chaque match sont calculées et figées à ce moment-là.
- **Après publication, avant le début** : on peut ajouter un match (cotes calculées aussitôt), modifier un match (l'ancien est retiré, ses pronostics remboursés, un match de remplacement reçoit de nouvelles cotes) ou en retirer un (pronostics remboursés ; au moins un match doit rester). Reporter déplace aussi la fermeture des pronostics ; ceux déjà faits sont conservés.
- **Après le début** : la composition est figée. Un report reste possible, mais les pronostics **restent fermés** (`predictionsCloseAt` ne bouge plus).
- **Annulation** (brouillon, ouverte ou verrouillée) : tous les pronostics en attente sont remboursés. Un brouillon peut aussi être supprimé.
- **Droits de gestion** (composer, publier, reporter, annuler) : le capitaine de l'équipe du club dans la rencontre (qu'elle reçoive ou se déplace) et les admins du club.
- **Visibilité** : un brouillon n'est visible que des admins et capitaines du club. Une fois publiée, la page de la rencontre est **publique** (lien partageable, sans compte), affiche les joueurs en « Prénom N. », n'est pas indexée par les moteurs de recherche, et a un identifiant non devinable.

### Machine à états (`src/lib/encounters/state.ts`, seul endroit où les transitions sont définies)
`DRAFT → OPEN → LOCKED → SCORE_PROPOSED → CONFIRMED`, `SCORE_PROPOSED → OPEN` (retrait de la proposition), `SCORE_PROPOSED → DISPUTED → CONFIRMED`, et `DRAFT | OPEN | LOCKED → CANCELLED`. Toute autre transition est rejetée avec un message clair. `LOCKED` n'est jamais stocké : c'est `OPEN` avec l'heure de fermeture des pronostics atteinte, calculé à la lecture, sans cron.

### Scores (tranche 7, `src/server/scores.ts`, contrôles purs dans `src/lib/scores/result.ts`)
- **Proposer** : capitaine de l'équipe du club dans la rencontre, ou admin du club, seulement une fois les pronostics fermés (heure de début atteinte). La proposition couvre tous les matchs actifs d'un coup : issue (joué, abandon, WO, non joué), vainqueur (aucun si non joué) et sets facultatifs (`6-4 3-6 10-8`, le troisième set à 10 points est un super tie-break).
- **Contrôle léger des sets** : joué jusqu'au bout avec sets = 2 ou 3 sets, scores plausibles (4 à 7 jeux, super tie-break à 10 points et 2 d'écart), vainqueur = celui qui gagne 2 sets. Abandon et WO : sets libres.
- **Confirmer ou contester** : une personne **différente** de l'auteur, admin du club ou capitaine d'une équipe du club (pas forcément celle de la rencontre). Contestation avec motif obligatoire.
- **Retirer** : l'auteur seul, tant que personne n'a confirmé ni contesté. Les résultats saisis sont effacés (retour à `OPEN` stocké, donc « pronostics fermés »).
- **Trancher un litige** : un admin du club (même s'il a proposé ou contesté) saisit le score définitif. L'écran affiche : « Chaque triche sera suivie d'un bannissement à vie de Ralli. » (il n'existe pas d'outil de bannissement dans l'app : voir EXCLUSIONS.md).
- **Confirmé = définitif** : plus aucune modification. La confirmation ne règle pas encore les pronostics (tranche 8).
- **Visibilité** : tant que le score n'est pas confirmé, le public voit seulement « Score proposé, en attente de confirmation » ; les résultats saisis, l'auteur, le motif et le journal ne sont visibles que des admins et capitaines du club. Une fois confirmé : scores et décompte publics, journal toujours réservé.
- Chaque action est écrite dans le journal de la rencontre (`EncounterEvent`) avec l'auteur, la date, le motif et les résultats.

### Règlement des pronostics (tranche 8, `src/server/settlement.ts`)
- Déclenché **dans la transaction** qui rend le score définitif (confirmation, ou arbitrage d'un litige) : si le règlement échoue, la confirmation est annulée avec lui. Jamais sur un score seulement proposé ou contesté.
- **Gagné** : le joueur choisi est le vainqueur (match joué, abandon ou WO). Aces gagnés = `computePayout(engagés, cote figée)`, soit engagés × cote, engagés compris, écriture `PREDICTION_PAYOUT` clé `payout:<id>`. **Perdu** : statut LOST, rien n'est rendu. **Non joué** : remboursement. Un match retiré avant le début a déjà été remboursé et est ignoré.
- **Idempotent** : `Encounter.settledAt` posé une seule fois (mise à jour conditionnelle), pronostic réglé seulement s'il est encore PENDING, clé unique au ledger.
- Filet de sécurité : `npm run settle -- <identifiant de rencontre>` règle une rencontre confirmée qui ne l'aurait pas été (sans effet si elle l'est déjà).
- Après règlement, une rencontre confirmée ne peut plus être corrigée dans l'app (voir EXCLUSIONS.md).

### Classements (tranche 9, `src/server/leaderboard.ts`, calcul pur dans `src/lib/leaderboard/rank.ts`)
- **Un classement par club**, réservé à ses membres (page `/clubs/<id>/classement`, aperçu du top 3 sur la page du club). Un pronostic compte dans le club **organisateur** de la rencontre.
- **Bénéfice net** = Aces gagnés − Aces engagés, sur les pronostics **gagnés ou perdus** de rencontres confirmées et réglées. Les remboursés, les pronostics en attente et les bonus (inscription, lundi) ne comptent pas.
- **Périodes** : « Saison » (dates dans `src/config/season.ts`, 1er septembre 2026 au 31 août 2027, à revoir) et « Cette semaine » (lundi 00:00 au lundi suivant 00:00, heure de Paris). Un pronostic compte à la **date de règlement** de sa rencontre.
- **Seuil** : 3 pronostics terminés sur la saison, 1 sur la semaine. Le lecteur voit ce qu'il lui manque.
- **Égalités** : même rang (1, 2, 2, 4) ; l'affichage départage par pronostics gagnés puis pseudo. 20 lignes affichées, plus la ligne du lecteur s'il est plus bas. Colonnes : rang, pseudo, bénéfice net, pronostics terminés, taux de réussite.
- Calculé à la lecture (aucune table de cache) : à jour dès le règlement.

### Interface (tranche 10, `docs/DESIGN.md`, aperçu `docs/design-preview.html`)
- **Accueil = cartes des rencontres** de vos clubs : la prochaine en grand (l'heure d'abord, le jour en clair, sans compte à rebours), les suivantes en cartes plus petites. Ni joueurs ni cotes sur l'accueil : on touche la carte pour ouvrir la rencontre.
- **Pronostic** : toucher la carte de la rencontre, puis la cote (la case se remplit de terre battue avant l'ouverture du panneau), choisir un montant (50, 100, 250, Tout, ou un montant libre), « Valider mon ralli ». Le panneau du bas (`<dialog>` natif) affiche le récapitulatif (Aces engagés, Aces gagnés si vous avez raison, solde après). Même panneau sur la page d'une rencontre. Définitif une fois validé.
- **Barre du bas** (connecté) : Matchs, Classement, Portefeuille, Club. Avec un seul club, Classement et Club y mènent directement ; sinon `/classement` et `/clubs` proposent la liste. Pas de sélecteur de club actif.
- **Solde dans l'en-tête**, relu à chaque navigation.
- **Partage WhatsApp** : « Partager la rencontre » (page publique) et « Partager mon pronostic » (liens `wa.me`).
- Polices : Norican (logo), Cormorant Garamond (titres, noms, grands chiffres), DM Sans (texte, boutons, cotes, menus). Couleurs : palette de la démo Ralli (vert Ralli `#1c5b3c`, vert action `#17503a`, or `#e6c872` sur fond vert et `#9a6f12` sur fond clair), détail dans `docs/DESIGN.md`, vérifiée par `npm run contrast`.

### Bonus de connexion (`src/server/daily-bonus.ts`, série dans `src/lib/bonus/streak.ts`, montants dans `src/config/game.ts`)
- **+10 Aces** à la **première ouverture de l'app de chaque jour** (jour de Paris, minuit à minuit) par un compte connecté : l'app appelle le serveur au chargement (`claimDailyBonusAction`) et affiche la popup « Connexion quotidienne X/7 +10 Aces ». Les sessions durent 30 jours, donc la saisie du mot de passe n'est pas ce qui compte.
- **+50 Aces en plus** le jour qui complète **7 jours d'affilée** (soit +60 ce jour-là) ; la série repart à 1/7 le lendemain, et le +50 revient aux jours 14, 21… Un jour manqué remet la série à 1.
- **Le jour de l'inscription ne donne rien** (le compte reçoit déjà 1000 Aces) : la série démarre le lendemain.
- Deux types d'écriture au ledger : `DAILY_LOGIN_BONUS` (+10, clé `daily:<compte>:<jour>`) et `STREAK_BONUS` (+50, clé `streak:<compte>:<jour>`). **Idempotent** : la clé unique du ledger empêche tout double crédit, même en cas d'ouvertures simultanées. La série se calcule à partir de ces écritures (pas de table dédiée).
- Se cumule avec le bonus du lundi (+200 sous 500 Aces).

### Remboursements
Un pronostic remboursé passe au statut `REFUNDED` et donne lieu à une écriture `PREDICTION_REFUND` au ledger. C'est idempotent : un filtre sur les pronostics en attente, une mise à jour conditionnelle et la clé unique `refund:<id>` du ledger empêchent tout double crédit.

### Équipes et joueurs
- **Équipes du club** : créées par l'admin, avec un capitaine obligatoire choisi parmi les membres. Seul l'admin change de capitaine.
- **Équipes adverses (externes)** : adversaires hors Ralli, créées par l'admin ou n'importe quel capitaine du club. Elles n'ont pas de capitaine et leurs joueurs ne sont jamais liés à un compte.
- **Effectif** : géré par l'admin et le capitaine de l'équipe (pour une équipe adverse : l'admin et tout capitaine du club). Un joueur peut figurer dans plusieurs équipes du club. Le niveau FFT se corrige à tout moment ; les cotes déjà figées ne changent pas.
- **Fiche joueur** : elle existe sans compte. Retirer un joueur d'une équipe conserve sa fiche. La supprimer n'est possible que s'il n'a jamais été aligné dans un match, pour garder l'historique des cotes.
- **Lien fiche ↔ compte** : posé par l'admin ou le capitaine, vers un membre du club ; personne ne se lie soi-même. Le lien ne peut ni être créé ni être retiré tant que le joueur figure dans une rencontre en cours (statut stocké `OPEN`, ce qui couvre `LOCKED`, ou `SCORE_PROPOSED`). Délier pendant une rencontre permettrait sinon à un joueur aligné de la pronostiquer.

### Anti-trucage (appliqué côté serveur)
Ne peuvent pas pronostiquer une rencontre : les capitaines des deux équipes, les joueurs alignés dans un de ses matchs et les comptes liés à ces joueurs, ainsi que les admins des clubs concernés. Les autres membres des effectifs le peuvent.

### Portefeuille
Le solde n'est jamais stocké : c'est la somme du ledger (`LedgerEntry`).

## Modèle de cotes (`src/lib/odds/`, constantes dans `src/config/odds.ts`)

⚠ **Constantes non calibrées** : valeurs de départ du brief, à valider par un backtest. Toute modification change `version`, enregistrée avec chaque cote figée.

1. **Rating** : rang dans l'échelle FFT × 100. NC = 0, 40 = 100, … −30 = 2300, 1re série = 2400 (un seul échelon).
2. **Forme** : sur les 5 derniers matchs confirmés du joueur, (victoires − défaites) × 10. Sans historique : 0.
3. **Confrontations directes (H2H)** : s'il y en a au moins une, (victoires A − victoires B) × 15.
4. **Écart unique** : d = (Ra + forme A) − (Rb + forme B) + H2H. P(A) = 1 / (1 + 10^(−d / 400)), et P(B) = 1 − P(A).
5. **Bornes symétriques** : P(A) est ramenée dans [0,12 ; 0,88], donc P(B) aussi. Les cotes vont de 1,14 à 8,33 et P(A) + P(B) = 1.
6. **Cote** = 1 / P, arrondie au centième et stockée en entier (156 = 1,56). Elle est figée sur le match à l'ouverture de la rencontre, puis copiée sur chaque pronostic.
7. **Historique pris en compte** : matchs de rencontres confirmées, joués jusqu'au bout ou terminés sur abandon. Les WO et les matchs non joués sont ignorés.

Le module est pur (aucun accès à la base ni à l'horloge). Il est testé sur l'égalité, les écarts croissants, l'écart extrême, les bornes, l'absence d'historique, la fenêtre de forme, le H2H et la symétrie (échanger A et B échange exactement les résultats).

## Garde-fous en base (SQL manuel de la migration `init`)

Prisma ne sait pas les exprimer : ils sont ajoutés à la main à la fin de `prisma/migrations/20261007120000_init/migration.sql`. Vérification : `npm run db:verify`.

- **Ledger append-only** : un trigger `BEFORE UPDATE OR DELETE` sur `LedgerEntry` lève une erreur pour toute modification ou suppression de ligne. Une correction se fait par une nouvelle écriture, jamais en réécrivant l'historique.
- **TRUNCATE reste permis** : c'est un trigger de niveau ligne, que `TRUNCATE` ne déclenche pas. Cela sert à réinitialiser la base de test (`TRUNCATE ... CASCADE`). Ne jamais l’utiliser sur la prod.
- **CHECK** :
  - `Prediction.committedAces >= 10` ;
  - `Prediction.oddsX100` entre 100 et 1000 ;
  - `LedgerEntry.amount < 0` pour `PREDICTION_COMMIT`, `> 0` pour `SIGNUP_BONUS`, `WEEKLY_BONUS`, `PREDICTION_PAYOUT` et `PREDICTION_REFUND`.
- **Calcul du gain** : uniquement via `computePayout` (`src/lib/predictions/payout.ts`), en arithmétique entière : `floor((committedAces × oddsX100 + 50) / 100)`.

## Filtre des rencontres et résultat (tranche 15, `src/lib/encounters/filters.ts`, `src/components/encounter-filters.tsx`)

- **Résultat du club** : pour une rencontre **terminée**, victoire, défaite ou **nul**, vu de l'**équipe du club** (jamais du lecteur), au **total des points** du score final (un match vaut 1 ou 2 points). Le badge de la liste remplace « Terminée » : « Victoire 3 – 2 » (vert), « Défaite 2 – 3 » (rouge), « Nul 2 – 2 », le club toujours en premier. La page de la rencontre garde son affichage.
- **Filtres** (page du club, un seul à la fois, dans l'adresse : `?statut=victoires`, un paramètre inconnu vaut « Toutes ») : Toutes, À venir (brouillons pour le staff, pronostics ouverts), En cours (pronostics fermés, score proposé, score contesté), Terminées, Victoires, Défaites, Nuls, Annulées. Chaque puce affiche son nombre. Les archives restent à part, sans filtre. Aucun changement de base : tout est calculé à partir des points.
- Démo de Lyon : 2 victoires, 1 défaite, 1 nul, 1 annulée, 3 en cours, 2 à venir.

## Lien d'invitation et écrans vides (tranche 16, `src/lib/clubs/invite-link.ts`, page `src/app/rejoindre/[code]/page.tsx`)

- **Lien** : `/rejoindre/CODE`. Sans compte, la page nomme le club et propose « Créer un compte » ou « J'ai déjà un compte » (`?invitation=CODE`) ; après l'inscription ou la connexion, retour sur le lien avec une **confirmation** (« Rejoindre X ? »), jamais d'adhésion automatique. Déjà membre : lien vers le club. Code faux ou périmé (régénéré) : message neutre, sans nom de club. Page `noindex`.
- **Garde-fou** : l'adresse de retour après connexion est toujours reconstruite à partir d'un code bien formé (`afterAuthPath`) : jamais d'adresse fournie par l'URL.
- **Bouton « Inviter par WhatsApp »** : chez l'admin, seulement une fois le code révélé ; le lien contient le code (à n'envoyer qu'aux personnes invitées). Un membre simple ne voit jamais le code ; il peut partager l'adresse d'inscription générale (sans code).
- **Écrans vides** : accueil et page du club. Admin ou capitaine : « Créer une rencontre » ; membre : « Ton capitaine publiera bientôt la prochaine rencontre » + « Inviter des coéquipiers ».
- **Pas encore fait** (en attente de la migration `onboardingSeenAt` / `resultsSeenAt` sur `User`, à valider) : guide du premier lancement en 3 écrans, puis tranche 17 (partage WhatsApp d'une rencontre, récapitulatif des pronostics réglés).
- Tests : `src/lib/clubs/invite-link.test.ts`, E2E `slice16-invitations.spec.ts`.

## Doubles (tranche 14, `src/server/encounters.ts`, cotes dans `src/lib/odds/model.ts`, libellés dans `src/lib/matches.ts`)

- **Composition** : « Ajouter un double » (en plus de « Ajouter un simple ») : 2 joueurs de l'effectif de l'équipe du club contre 2 joueurs de l'effectif de l'équipe adverse, rien d'autre. Un joueur peut jouer **un simple et un double** dans la même rencontre, jamais deux doubles ni deux simples. Aucune limite du nombre de matchs.
- **Points** : chaque match vaut **1 ou 2 points** au score final (choix du club à la composition, 1 par défaut ; l'écran ne le propose que pour les doubles, le serveur et la base l'acceptent pour tout match). Le « Score final » additionne les points des matchs gagnés ; un match sans vainqueur (non joué) ne rapporte rien.
- **Cotes** : mêmes formule et bornes que le simple, appliquées à la **moyenne des niveaux FFT** de chaque paire. Ni forme ni confrontations directes. Les doubles ne nourrissent **pas** la forme ni les confrontations des simples (`loadHistory` ne lit que les simples).
- **Anti-trucage** : les quatre joueurs d'un double et les comptes liés à leur fiche ne peuvent pronostiquer aucun match de la rencontre ; le lien fiche ↔ compte est gelé et la fiche non supprimable comme pour un simple.
- **Affichage** : simples d'abord, puis doubles ; numérotation par type (Simple 1, Simple 2, Double 1…) ; paire affichée « Léa M. / Hugo D. », niveaux « 30 · 30/1 ». Score saisi comme un simple (issue, vainqueur = la paire, sets).
- **Données** : `Match.kind` (SINGLES ou DOUBLES), `points`, `homePlayer2Id`, `awayPlayer2Id` (migration `20261009180000_doubles`) ; la base refuse un double sans ses quatre joueurs, un simple avec un joueur en plus, une paire de deux fois le même joueur et un nombre de points hors 1 ou 2.
- Démo : un double d'1 point (terminée il y a 21 jours), un de 2 points (terminée il y a 8 jours) et un de 2 points sur la rencontre ouverte de Lyon.

## Archivage des rencontres (tranche 13, `archiveEncounter` / `unarchiveEncounter` dans `src/server/encounters.ts`)

- **Quoi** : une rencontre **terminée** (score confirmé, y compris après un litige tranché) ou **annulée** se range dans les archives du club. Les autres statuts (brouillon, ouverte, verrouillée, score proposé, contestée) ne sont pas archivables, ni par l'app ni par la base (CHECK `Encounter_archived_status_check`).
- **Qui** : les admins du club et le capitaine de l'équipe du club dans la rencontre (comme l'annulation). Archivage **pour tout le club** : la rencontre sort de la liste de tous.
- **Interface** : petite croix rouge (ronde, 44 px) à droite de chaque rencontre archivable de la page du club, avec confirmation. Section repliée « Archives (n) » sous la liste, visible des admins et capitaines, avec « Désarchiver » (réservé à qui peut gérer la rencontre).
- **Rien n'est supprimé ni recalculé** : classements, soldes et historique des Aces inchangés, cotes (historique des matchs) inchangées ; la page de la rencontre reste accessible par son lien (partage WhatsApp) ; l'archivage et la sortie des archives sont notés au journal (« Archivée », « Sortie des archives »).
- **Données** : `Encounter.archivedAt` et `archivedById` (migration `20261009140000_encounter_archive`). Couleur rouge `danger` ajoutée au thème (contraste vérifié par `npm run contrast`).

## Profil et avatars (tranche 12, `src/lib/avatars.ts`, `src/server/avatars.ts`, page `/profil`)

- **Bannière** : logo, solde sur une ligne, avatar rond tout à droite (il mène à « Mon profil »). Le pseudo n'est plus affiché (il reste pour les lecteurs d'écran) ; « Déconnexion » est sur la page du profil.
- **12 avatars prédéfinis** : personnages stylisés de tennis (pas de portraits de joueurs réels : droit à l'image), fichiers SVG dans `public/avatar/`. Un avatar tiré au hasard à l'inscription ; les comptes existants en ont reçu un par la migration `20261009100000_user_avatar`.
- **Photo importée** : JPG, PNG ou WebP, 5 Mo au maximum ; le contenu est relu par `sharp` (le type annoncé ne compte pas), recadré au centre en carré, ramené à 256 px, enregistré en WebP dans le dossier **`avatar/`** (ignoré par git ; `AVATAR_DIR` pour le changer). Choisir un avatar prédéfini retire la photo. La limite des envois (`serverActions.bodySizeLimit`) est de 6 Mo dans `next.config.ts`.
- **Visibilité** : la route `/api/avatar/<id>` sert la photo à son propriétaire et aux membres d'un club en commun (401 sans session, 404 sinon). Les avatars apparaissent dans la bannière, le profil, la liste des membres, le classement et son aperçu sur la page du club.
- **Modération** : un admin voit « Retirer la photo » sur les membres de son club qui ont une photo (avec confirmation) ; l'avatar prédéfini revient.
- **À savoir** : le dossier `avatar/` ne fonctionnera pas sur Vercel (disque en lecture seule). Pour la mise en ligne, remplacer uniquement `src/server/avatar-storage.ts` par un stockage de fichiers (Vercel Blob).

## Démo (tranche 11, `src/server/demo-seed.ts`, commande `scripts/seed-demo.ts`)

`npm run seed:demo` remplit la base de dev avec des données de démonstration, en passant par les **vraies fonctions** du produit (soldes, ledger, cotes et classements sont donc cohérents). Les dates sont relatives à l'instant du lancement : relancer le matin d'une démo remet tout à neuf.

- **Garde-fous** : refuse toute base qui n'est pas locale (`localhost`), sauf autorisation explicite qui recopie le nom exact du serveur visé (`-- --base-distante=<serveur>`, utilisée pour charger la démo sur Neon ; jamais avec `--reset`) ; refuse si la démo est déjà chargée ; `-- --reset` vide **toute** la base (le ledger est append-only, on ne peut pas supprimer que les lignes de démo) et exige `-- --reset --tout-effacer` si des comptes non démo existent.
- **Comptes** (mot de passe commun `demo-ralli-2026`, connexion par pseudo ou `pseudo@demo.ralli.test`) : `admin_lyon`, `capitaine_lyon`, `capitaine_dames_lyon`, `joueur_lyon` (fiche liée, aligné en Messieurs 1), `admin_nantes`, `capitaine_nantes`, `joueur_nantes`, `admin_bordeaux` (club vide), `parieur1` à `parieur6`. Les comptes sont créés « il y a 30 jours » : la popup de connexion quotidienne apparaît à la première ouverture.
- **TC Démo-Lyon** (Messieurs 1, Dames 1, 5 équipes adverses) : 4 rencontres terminées (dont une réglée il y a quelques heures, pour le classement « semaine »), 1 score contesté, 1 score proposé, 1 verrouillée, 1 annulée avec remboursements, 1 ouverte à venir, 1 brouillon. **TC Démo-Nantes** : 1 terminée, 1 ouverte. Les codes d'invitation sont affichés à la fin de la commande.
- Tests : `src/server/demo-seed.db.test.ts` (états, soldes jamais négatifs, classements, anti-trucage, relance après vidage) ; E2E `slice11-demo.spec.ts` (charge la vraie commande dans la base de test, parcourt les écrans en format téléphone) et `slice11-parcours-complet.spec.ts` (club → équipe → rencontre → pronostics → score → règlement → classement, 4 rôles + visiteur).

## Documents

- [EXCLUSIONS.md](EXCLUSIONS.md) : ce qui est volontairement hors MVP.
