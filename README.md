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

- **Œil « afficher le mot de passe »** (`PasswordField` et `useRevealPassword` dans `src/components/ui.tsx`) sur l'inscription, la connexion et le changement de mot de passe (un seul œil pour « Nouveau » et « Confirmer », qui s'affichent ensemble). Caché par défaut ; bouton de 44 px nommé « Afficher / Masquer le mot de passe » (`aria-pressed`), commandable au clavier. Le mot de passe se **cache de nouveau** dès que le serveur répond (formulaire refusé) et en quittant l'écran ; il n'est jamais renvoyé en clair par le serveur. Affiché, le champ désactive majuscule et correction automatiques. Tests E2E : `slice18-oeil-mot-de-passe.spec.ts` (les anciens tests cherchent le champ par `getByLabel("Mot de passe", { exact: true })`, car le bouton contient les mêmes mots).

- Auth.js v5, provider *credentials* (email + mot de passe), sessions JWT signées par `AUTH_SECRET`. Le JWT ne contient que l'identifiant : pseudo, rôles et drapeau « mot de passe temporaire » sont relus en base à chaque requête.
- Mots de passe hachés avec bcrypt (coût 12). Message d'erreur identique pour « email inconnu » et « mauvais mot de passe », avec un temps de réponse comparable.
- Pas d'email, donc pas de mot de passe oublié en libre-service : un opérateur lance `npm run reset-password -- <email>` et transmet le mot de passe temporaire. La personne doit le changer avant d'accéder au reste de l'app.
- `AUTH_TRUST_HOST=true` est nécessaire pour `next start` en local ; inutile sur Vercel.

## Règles métier notables

### Rôles de club
- **Créer un club est réservé aux comptes dont la demande « Je suis admin d'un club » a été acceptée** (tranche 26, `src/server/club-requests.ts`, page `/clubs/demande`, table `ClubCreationRequest`). Formulaire : nom complet, club, ville, fonction, numéro d'affiliation FFT, site (facultatif), téléphone, message (facultatif) ; une seule demande en attente par compte ; refusée = on peut en refaire une. Une demande acceptée donne droit à **un seul club**. Pour l'instant **aucun écran ni commande de validation** (un email viendra plus tard) : l'équipe Ralli passe la demande en `APPROVED` directement en base. `/clubs/nouveau` renvoie vers la demande sans droit ; les clubs déjà créés ne changent pas.
- Le créateur d'un club en est **admin**. Rejoindre par code donne le rôle **membre**.
- Seuls les admins nomment ou retirent des admins, et retirent un membre (voir « Retrait d'un membre »). Un club garde toujours au moins un admin.
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
- **Bénéfice** = Aces gagnés − Aces engagés, sur les pronostics **gagnés ou perdus** de rencontres confirmées et réglées. Les remboursés, les pronostics en attente et les bonus (inscription, lundi) ne comptent pas.
- **Périodes** : « Saison » (dates dans `src/config/season.ts`, 1er septembre 2026 au 31 août 2027, à revoir) et « Cette semaine » (lundi 00:00 au lundi suivant 00:00, heure de Paris). Un pronostic compte à la **date de règlement** de sa rencontre.
- **Seuil** : 3 pronostics terminés sur la saison, 1 sur la semaine. Le lecteur voit ce qu'il lui manque.
- **Égalités** : même rang (1, 2, 2, 4) ; l'affichage départage par pronostics gagnés puis pseudo. 20 lignes affichées, plus la ligne du lecteur s'il est plus bas. Colonnes : rang, pseudo, bénéfice, pronostics terminés, taux de réussite.
- Calculé à la lecture (aucune table de cache) : à jour dès le règlement.

### Interface (tranche 10, `docs/DESIGN.md`, aperçu `docs/design-preview.html`)
- **Accueil = cartes des rencontres** de vos clubs : la prochaine en grand (l'heure d'abord, le jour en clair, sans compte à rebours), les suivantes en cartes plus petites. Ni joueurs ni cotes sur l'accueil : on touche la carte pour ouvrir la rencontre.
- **Pronostic** : toucher la carte de la rencontre, puis la cote (la case se remplit de terre battue avant l'ouverture du panneau), choisir un montant (50, 100, 250, Tout, ou un montant libre), « Valider mon ralli ». Le panneau du bas (`<dialog>` natif) affiche le récapitulatif (Aces engagés, Aces gagnés si vous avez raison, solde après). Même panneau sur la page d'une rencontre. Définitif une fois validé.
- **Barre du bas** (connecté) : Matchs, Mes rallis, Classement, Club (le Portefeuille et les Résultats sont regroupés dans « Mes rallis », tranche 20). Avec un seul club, Classement et Club y mènent directement ; sinon `/classement` et `/clubs` proposent la liste. Pas de sélecteur de club actif.
- **Solde dans l'en-tête**, relu à chaque navigation.
- **Messages des formulaires** (`FormMessage` dans `src/components/ui.tsx`, animations dans `globals.css`) : une réussite (`ok: true` dans l'état renvoyé par l'action) affiche une pastille verte avec une coche qui se dessine, puis le texte, et **disparaît seule après 4 s** ; une erreur affiche une pastille rouge avec « ! » et **reste affichée**. Chaque réponse du serveur (`signal={state}`) rejoue l'animation, même avec un texte identique. Sans animation avec « réduire les animations » (la confirmation disparaît quand même à 4 s). Toute action qui réussit doit renvoyer `ok: true`. Hors périmètre : l'erreur du panneau de pronostic (fond sombre, `match-picks.tsx`). Décision de Benjamin : variante « coche qui se dessine » (aperçu comparatif A à E essayé dans le navigateur). Tests : `slice19-messages.spec.ts`.
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

**Fenêtre « Pronostic impossible »** (`src/components/match-picks.tsx`, demandée par Benjamin) : pour ces comptes (admin, capitaine, joueur aligné ou lié), les cotes sont des boutons ; en toucher une, sur n'importe quel match et n'importe quel joueur, ouvre une fenêtre du bas avec la raison et un bouton « J'ai compris » (Échap ou un toucher à côté la ferme aussi). La note sous les cotes reste affichée avec le même texte. Messages : « Les admins ne peuvent pas pronostiquer les matchs de leurs clubs. » (« pronostiquer » et non « parier » : mot interdit), « Un capitaine ne peut pas pronostiquer la rencontre de son équipe. », « Vous êtes aligné dans cette rencontre : vous ne pouvez pas la pronostiquer. » Aucune fenêtre quand les pronostics sont fermés ou pour un simple membre. Tests E2E : `slice22-fenetre-blocage.spec.ts`.

### Portefeuille
Le solde n'est jamais stocké : c'est la somme du ledger (`LedgerEntry`). Il n'y a plus de page « Portefeuille » : le solde est dans l'en-tête (il mène à « Mes rallis »), les rallis en cours et l'historique des 50 derniers mouvements sont dans « Mes rallis » (tranche 20).

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

## Lien d'invitation et écrans vides (tranche 16, réécrit en tranche 30 : `src/lib/clubs/invite-link.ts`)

- **Plus de code d'invitation** (supprimé en tranche 30, colonne `Club.inviteCode` retirée). Le lien d'invitation est l'adresse de la page du club, `/clubs/<id>`. Sans compte, ce lien mène à `/connexion?club=<id>` (avec « S'inscrire » qui garde `?club=`) ; après la connexion ou l'inscription on arrive sur la page du club, où il faut appuyer sur « Rejoindre le club » (jamais d'adhésion automatique). Les anciens liens `/rejoindre/CODE` et la page « Rejoindre par code » (`/clubs/rejoindre`) redirigent vers `/clubs/recherche` (`next.config.ts`).
- **Garde-fou** : l'adresse de retour après connexion est toujours reconstruite à partir d'un identifiant de club bien formé (`parseClubParam`, `afterAuthPath`) : jamais d'adresse fournie par l'URL.
- **Bouton « Inviter par WhatsApp »** : bloc « Inviter » en bas de la page du club, visible de **tous les membres** ; il partage le lien de la page du club avec un petit message.
- **Écrans vides** : accueil et page du club. Admin ou capitaine : « Créer une rencontre » ; membre : « Ton capitaine publiera bientôt la prochaine rencontre » + « Inviter des coéquipiers ».
- Le guide du premier lancement et le récapitulatif des pronostics réglés sont décrits plus bas (section « Guide du premier lancement et récapitulatif »).
- Tests : `src/lib/clubs/invite-link.test.ts`, E2E `slice16-invitations.spec.ts`.

## Guide du premier lancement et récapitulatif (tranches 16 et 17, `src/components/welcome-popups.tsx`, `src/server/onboarding.ts`)

- **Une seule fenêtre à la fois, dans cet ordre** : 1. guide du premier lancement, 2. récapitulatif des pronostics réglés, 3. bonus de connexion du jour. Chacune rafraîchit la page en se fermant : la suivante prend sa place. Aucune ne s'affiche tant que le mot de passe est provisoire.
- **Guide** (`src/components/onboarding-guide.tsx`) : un écran d'accueil (« Tu as 1 000 Aces » : monnaie virtuelle de Ralli, seule monnaie du jeu, aucun vrai argent) avec « Faire la visite » et « Passer », puis une **visite guidée sur la vraie page** en 6 étapes : solde, Matchs, Mes rallis, Classement, Club, avatar. L'écran s'assombrit, un cadre doré entoure l'élément (repéré par son attribut `data-tour`, ajouté sur `balance-pill.tsx`, `tab-bar.tsx`, `user-nav.tsx`) et une bulle l'explique (compteur « 2/6 », « Précédent », « Suivant », « Passer » ; « Terminer » à la dernière étape). Textes différents pour un compte sans club (Matchs, Mes rallis, Classement, Club). Un élément introuvable (1,5 s d'attente) est sauté. Échap = passer. Le cadre reste entièrement dans l'écran, se déplace sans transition avec « réduire les animations ». Fini ou passé : `User.onboardingSeenAt` posé, il ne revient plus. « Revoir le guide » sur `/profil` (seul moyen de le revoir) rejoue tout sur la page du profil sans rien enregistrer. La migration `20261010100000_user_onboarding` marque les comptes existants comme « vus ». Décisions de Benjamin : un seul écran d'accueil, visite sur la vraie page, même visite pour tous les rôles, pronostic expliqué en une phrase (bulle Matchs), pas d'accès automatique pour les comptes existants.
- **Récapitulatif** : à l'ouverture de l'app, les pronostics passés à gagné, perdu ou remboursé depuis `User.resultsSeenAt`, groupés par rencontre (lien vers la rencontre). Titre = **Aces gagnés** (somme des gains), « X pronostics justes sur Y » ; perdant : « Pas cette fois » ; tout remboursé (annulation, match remplacé) : « Tes Aces te sont rendus », avec une ligne « remboursé » par pronostic. Pluie d'or (CSS seulement, `.gold-rain`) uniquement si des Aces ont été gagnés, masquée avec « réduire les animations ». À la fermeture, `resultsSeenAt` avance jusqu'à la date du dernier pronostic **montré** (pas « maintenant ») : un pronostic réglé pendant que la fenêtre était ouverte reviendra la fois suivante. Cette date ne recule jamais.
- **Démo** (`seed:demo`) : les comptes sont créés « déjà vus » (ni guide, ni récapitulatif de l'historique de la démo).
- **Message WhatsApp d'une rencontre** (« Partager la rencontre ») : « <équipes>, <jour> à <heure> 🎾 Fais ton pronostic sur Ralli (jeu gratuit, sans argent réel) : <lien> ».
- Tests : `src/server/onboarding.db.test.ts`, E2E `slice17-guide-recap.spec.ts` (le helper `signUp` passe l'écran d'accueil du guide ; `signUpRaw` du fichier de test le montre).

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
- **Photo importée** : JPG, PNG ou WebP, 5 Mo au maximum ; le contenu est relu par `sharp` (le type annoncé ne compte pas), recadré au centre en carré, ramené à 256 px, enregistré en WebP. **Où** : avec la variable `BLOB_STORE_ID` (posée par Vercel quand le stockage est relié au projet : identification automatique OIDC) ou `BLOB_READ_WRITE_TOKEN` (ancienne méthode), dans **Vercel Blob en accès privé** (`avatar/<id>.webp`, remplacé à chaque import, lu sans cache) ; sans l'une ni l'autre, dans le dossier **`avatar/`** (ignoré par git ; `AVATAR_DIR` pour le changer), pour le développement et les tests. Dans les deux cas la photo n'est jamais servie directement : toujours via `/api/avatar/<id>` qui vérifie qui peut la voir. Tout est dans `src/server/avatar-storage.ts`. Choisir un avatar prédéfini retire la photo. La limite des envois (`serverActions.bodySizeLimit`) est de 6 Mo dans `next.config.ts`.
- **Visibilité** : la route `/api/avatar/<id>` sert la photo à son propriétaire et aux membres d'un club en commun (401 sans session, 404 sinon). Les avatars apparaissent dans la bannière, le profil, la liste des membres, le classement et son aperçu sur la page du club.
- **Modération** : un admin voit « Retirer la photo » sur les membres de son club qui ont une photo (avec confirmation) ; l'avatar prédéfini revient.
- **À savoir** : le dossier `avatar/` ne fonctionnera pas sur Vercel (disque en lecture seule). Pour la mise en ligne, remplacer uniquement `src/server/avatar-storage.ts` par un stockage de fichiers (Vercel Blob).

## Démo (tranche 11, `src/server/demo-seed.ts`, commande `scripts/seed-demo.ts`)

`npm run seed:demo` remplit la base de dev avec des données de démonstration, en passant par les **vraies fonctions** du produit (soldes, ledger, cotes et classements sont donc cohérents). Les dates sont relatives à l'instant du lancement : relancer le matin d'une démo remet tout à neuf.

- **Garde-fous** : refuse toute base qui n'est pas locale (`localhost`), sauf autorisation explicite qui recopie le nom exact du serveur visé (`-- --base-distante=<serveur>`, utilisée pour charger la démo sur Neon ; jamais avec `--reset`) ; refuse si la démo est déjà chargée ; `-- --reset` vide **toute** la base (le ledger est append-only, on ne peut pas supprimer que les lignes de démo) et exige `-- --reset --tout-effacer` si des comptes non démo existent.
- **Comptes** (mot de passe commun `demo-ralli-2026`, connexion par pseudo ou `pseudo@demo.ralli.test`) : `admin_lyon`, `capitaine_lyon`, `capitaine_dames_lyon`, `joueur_lyon` (fiche liée, aligné en Messieurs 1), `admin_nantes`, `capitaine_nantes`, `joueur_nantes`, `admin_bordeaux` (club vide), `parieur1` à `parieur6`. Les comptes sont créés « il y a 30 jours » : la popup de connexion quotidienne apparaît à la première ouverture.
- **TC Démo-Lyon** (Messieurs 1, Dames 1, 5 équipes adverses) : 4 rencontres terminées (dont une réglée il y a quelques heures, pour le classement « semaine »), 1 score contesté, 1 score proposé, 1 verrouillée, 1 annulée avec remboursements, 1 ouverte à venir, 1 brouillon. **TC Démo-Nantes** : 1 terminée, 1 ouverte. Les liens des clubs sont affichés à la fin de la commande.
- Tests : `src/server/demo-seed.db.test.ts` (états, soldes jamais négatifs, classements, anti-trucage, relance après vidage) ; E2E `slice11-demo.spec.ts` (charge la vraie commande dans la base de test, parcourt les écrans en format téléphone) et `slice11-parcours-complet.spec.ts` (club → équipe → rencontre → pronostics → score → règlement → classement, 4 rôles + visiteur).

## Fiche du club et logo (tranche 18, `src/lib/clubs/profile.ts`, `src/server/club-profile.ts`, page `/clubs/<id>/fiche`)

- **Quoi** : chaque club a une fiche remplie par ses **admins** : année de fondation, nombre de licenciés, adresse (rue, code postal, ville), site web, nombre de courts intérieurs et extérieurs, description (500 caractères), plus un **logo**. Tout est facultatif ; le nom du club est modifiable depuis la même fiche. Une case non renseignée affiche « Non précisé » (0 est une valeur : « 0 court » n'est pas « Non précisé »).
- **Qui** : lecture réservée aux **membres du club** (un non-membre voit « Page introuvable », comme pour le reste du club) ; écriture (fiche, nom, logo) réservée aux **admins**, contrôlée côté serveur à chaque appel. Pas de fiche publique pour l'instant (décision de Benjamin, à revoir plus tard).
- **Écrans** : bloc en haut de la page du club (logo, nom, ville, nombre de licenciés, site) avec « Voir la fiche du club » ; page dédiée avec toutes les informations et, pour les admins, un bouton « Modifier la fiche » : le bloc de modification (import du logo, formulaire) n'existe qu'après ce clic, et « Fermer » le replie (il est aussi refermé à chaque rechargement de la page). Le logo apparaît aussi dans « Mes clubs » et, si l'utilisateur a **plusieurs clubs**, sur les cartes de rencontres de l'accueil. Fiche vide : message « Complète la fiche de ton club » pour l'admin, rien pour les membres (pas même le lien).
- **Confirmations** : « Confirmer ces changements ? » avant d'enregistrer la fiche ; « Retirer le logo du club ? » avant de retirer le logo. Vider un champ l'efface.
- **Site web** : seules les adresses commençant par `http://` ou `https://` sont acceptées (jamais `javascript:` ni `data:`) ; le lien s'ouvre dans un nouvel onglet (`noopener noreferrer`). Le champ n'utilise pas la validation du navigateur, pour que le message en français s'affiche.
- **Logo** : JPG, PNG ou WebP, 5 Mo maximum, contenu relu par `sharp`. **Jamais recadré** (un blason reste entier) : ramené à 512 px au plus, sans agrandissement, en WebP, affiché dans un cadre carré avec de l'air autour. Sans logo : pastille verte Ralli avec les initiales (sigle en majuscules conservé : « TC Démo-Lyon » → TC ; sinon deux premières lettres, connecteurs « de », « du »… ignorés). Les admins peuvent le retirer.
- **Stockage** : même fichier que les photos de profil (`src/server/avatar-storage.ts`, paramètre `store = "club-logo"`) : Vercel Blob privé (`club-logo/<id>.webp`) dès que le stockage est relié, sinon dossier local `avatar/club-logo/`. Le logo n'est jamais servi directement : toujours via `/api/club-logo/<id>`, qui vérifie que le lecteur est membre (401 sans session, 404 sinon). L'adresse porte la date (`?v=`).
- **Données** : colonnes facultatives sur `Club` (`foundedYear`, `licenseeCount`, `address`, `postalCode`, `city`, `websiteUrl`, `description`, `indoorCourts`, `outdoorCourts`, `logoUpdatedAt`), migration `20261010150000_club_profile` ; la base refuse une année hors 1800 à 2100, un nombre de licenciés hors 0 à 10 000, des courts hors 0 à 100, des textes trop longs et un site qui ne commence pas par http(s) (CHECK, vérifiés par `npm run db:verify`).
- **Tests** : `src/lib/clubs/profile.test.ts`, `src/server/club-profile.db.test.ts`, `src/server/avatar-storage.test.ts`, E2E `slice20-fiche-club.spec.ts`.

## Onglet Mes rallis (tranches 19 et 20, `src/lib/predictions/results.ts`, `src/server/results.ts`, page `src/app/rallis/page.tsx`)

- **Tranche 20 (fusion avec le Portefeuille, décisions de Benjamin : tout selon mes recommandations)** : un seul onglet **« Mes rallis »**, à la place 2 de la barre (4 onglets : Matchs, Mes rallis, Classement, Club), page **`/rallis`**. De haut en bas : **En cours** (rallis en attente, avec le total des Aces engagés), puis le bilan, les filtres et la liste des terminés (ci-dessous), puis l'**Historique des Aces** (50 derniers mouvements) dans un bloc **replié par défaut**. Le solde n'est pas répété (il est dans l'en-tête, dont le bouton mène à « Mes rallis »). `/portefeuille` et `/resultats` redirigent vers `/rallis` (`redirects()` dans `next.config.ts`, paramètres conservés : `?statut=gagnes` suit). La visite guidée passe à **6 étapes**. Pas d'évolution de la base.
- **Quoi** (tranche 19) : tous les rallis (pronostics) **terminés** de l'utilisateur connecté, tous clubs confondus, du plus récent au plus ancien (date de règlement). Les textes de l'onglet disent « ralli » (« 3 rallis justes sur 5 », « Ton ralli : Léa M. »), jamais « pari » ni « mise ».
- **Résumé** (en haut, sur l'ensemble des rallis terminés, quel que soit le filtre) : « X rallis justes sur Y · Z % de réussite », Aces engagés, Aces gagnés, **bénéfice**. Même définition que le classement : gagnés et perdus seulement ; les **remboursés** (annulation, match remplacé, non joué) ne comptent ni dans les engagés ni dans le bénéfice, une note le rappelle.
- **Liste** : groupée par rencontre (titre « Club · Équipe – Adversaire », jour), une ligne par ralli : le match, « Ton ralli : joueur, N Aces engagés à la cote X » et le résultat en clair, **Gagné +178 Aces** (gain − engagés), **Perdu −100 Aces**, **Remboursé**. Toucher une ligne ouvre la rencontre. Les rallis en attente n'y sont pas (ils restent dans le Portefeuille).
- **Filtres** : puces « Tous / Gagnés / Perdus / Remboursés » avec leur nombre, un seul à la fois, dans l'adresse (`?statut=gagnes`) ; une valeur inconnue revient à « Tous ».
- **Longueur** : 20 rallis, puis « Voir plus » (`?limite=40`…, par paliers de 20, 200 au plus ; une valeur invalide vaut 20).
- **Visibilité** : chacun ne voit que ses propres rallis (la requête est filtrée par l'utilisateur connecté) ; un visiteur est renvoyé à la connexion. Compte sans ralli terminé : écran vide expliqué avec un lien vers les matchs.
- **Autres changements** : la section « Pronostics terminés » a quitté le Portefeuille (pas de doublon).
- **Données** : aucune évolution de la base (le pronostic garde déjà choix, Aces engagés, cote, résultat et date de règlement).
- **Tests** : `src/lib/predictions/results.test.ts`, `src/server/resultats-onglet.db.test.ts`, E2E `slice21-resultats.spec.ts` (compare l'écran à la base avec la démo) ; `slice7`, `slice11`, `slice14`, `slice17` et `slice10` ont été adaptés.

## Page du club allégée (tranche 21, `src/app/clubs/[clubId]/page.tsx`)

- **Pourquoi** : plan « app la plus minimaliste possible » demandé par Benjamin (point 3 ; décisions : tout selon mes recommandations, variante A).
- **Ce qui reste visible d'emblée** : l'en-tête (logo, nom, résumé, fiche), les **rencontres** (filtres, création, archives) et le **classement** (top 3).
- **Sections repliées par défaut** (éléments `<details>`, le titre porte le nombre : « Équipes du club (2) », « Équipes adverses (5) », « Membres (12) », testids `section-teams`, `section-opponents`, `section-members`) : équipes du club (avec « Créer une équipe » pour les admins), équipes adverses (avec « Ajouter une équipe adverse » pour les admins et capitaines), membres (rôles et « Retirer la photo » pour les admins). Les droits ne changent pas ; une section se referme à chaque rechargement de la page.
- **Invitation** : bloc « Inviter » (WhatsApp) en bas de la page, pour tous les membres (le code d'invitation a disparu en tranche 30).
- **Tests** : E2E `slice23-page-club.spec.ts` ; le helper `openSection(page, nom)` (tests/e2e/helpers.ts) ouvre une section avant d'y cliquer ; une quinzaine de tests de `slice2`, `slice3`, `slice5` à `slice7`, `slice10`, `slice11`, `slice12`, `slice14` et `slice17` l'utilisent.

## Compteur de rallis par match (tranche 22, `predictorCountLabel` dans `src/lib/predictions/labels.ts`, `getEncounterPage` dans `src/server/encounters.ts`)

- Sur la page d'une rencontre, sous les cotes de **chaque match** : « 12 membres ont pronostiqué » (« 1 membre a pronostiqué » au singulier). **Le nombre seulement**, jamais pour qui ni la répartition (pour ne pas influencer).
- Rien quand le nombre est 0. Affiché **avant, pendant et après** : pronostics ouverts, fermés, score confirmé. Visible de **tout le monde**, y compris les membres qui ne peuvent pas pronostiquer (admins, capitaines) et le visiteur sans compte (la page d'une rencontre est publique).
- Comptent : rallis en attente, gagnés, perdus. Les **remboursés** (rencontre annulée, match remplacé ou non joué) ne comptent plus. Aucune évolution de la base.
- Tests : `src/lib/predictions/labels.test.ts`, `src/server/predictor-count.db.test.ts`, E2E `slice24-animation.spec.ts` (compare l'écran à la base avec la démo).

## Marqueur « Nouveau » et pastille de l'onglet (tranche 23, `isRecentResult` dans `src/lib/predictions/results.ts`, `hasUnseenResults` dans `src/server/onboarding.ts`)

- Dans « Mes rallis », un ralli réglé depuis **moins de 48 heures** porte un marqueur « **Nouveau** » ; s'il est **gagné**, un éclat doré passe une fois sur sa ligne (`.won-new`, coupé avec « réduire les animations »). Calculé à partir de la date de règlement : pas de nouvelle donnée en base.
- **Pastille** sur l'onglet « Mes rallis » (point de terre battue, libellé « Nouveaux résultats » pour les lecteurs d'écran) tant que des rallis ont été réglés depuis la dernière fermeture de la popup de résultats (même date `User.resultsSeenAt`). Demandée par Benjamin « pour tester » : comme la popup de résultats s'ouvre dès la connexion, la pastille ne se voit en pratique que derrière la popup, ou pour des résultats arrivés pendant la session. Elle disparaît à la fermeture de la popup.
- **La popup de résultats avec la pluie d'or est conservée** (décision de Benjamin : « comme Betclic »).
- Tests : `src/lib/predictions/results.test.ts`, `src/server/results-badge.db.test.ts`, E2E `slice24-animation.spec.ts`.

## Classement vivant (tranche 24, `rankMove` et `weekLeaders` dans `src/lib/leaderboard/rank.ts`, `getLeaderboard` dans `src/server/leaderboard.ts`)

- **Mouvement de place depuis lundi** sur le classement de la **saison**, sur la ligne du lecteur : `▲2`, `▼1`, `=` ou `Nouveau` (la phrase complète, par exemple « 2 places gagnées depuis lundi », est lue par les lecteurs d'écran). Comparé au classement de la saison **tel qu'il était lundi 00 h (heure de Paris)**, recalculé avec les seules rencontres réglées avant lundi. « Nouveau » : pas classé lundi (moins de 3 rallis terminés). Pas de mouvement sur « Cette semaine ».
- **Page du club** : sous l'aperçu du classement, « Ta place : 2e ▲1 depuis lundi » pour un lecteur classé.
- **Leader de la semaine** : bande en haut du classement (saison et semaine), « Leader de la semaine · Jade · +120 Aces » ; en cas d'égalité en tête, les noms sont réunis par « et ». N'est affichée **que s'il y a un leader** (décision de Benjamin) ; j'ai ajouté une condition : son bénéfice de la semaine doit être **positif** (sinon personne ne « mène »).
- **Pas de bouton de partage du classement** (décision de Benjamin).
- Aucune évolution de la base.
- Tests : `src/lib/leaderboard/rank.test.ts`, `src/server/leaderboard-live.db.test.ts`, E2E `slice24-animation.spec.ts` (recalcule les places depuis la base).

## Animations et série d'affilée (tranche 25, `src/components/balance-pill.tsx`, `src/app/globals.css`, `currentStreak` dans `src/lib/predictions/results.ts`)

- **Solde** : il « compte » jusqu'à sa nouvelle valeur en 0,6 s quand il change (ralli validé, gain, bonus) ; pas d'animation au premier affichage ; valeur changée tout de suite avec « réduire les animations ». `data-balance` porte toujours la vraie valeur.
- **Cartes** : les cartes d'une page apparaissent en douceur, l'une après l'autre (`main > section > *`, 320 ms, décalage de 40 ms).
- **Série** : « N d'affilée » dans le bilan de « Mes rallis », à partir de **2 rallis justes d'affilée** ; série **en cours**, les remboursés ne la prolongent ni ne l'interrompent ; ne dépend ni du filtre ni de « Voir plus ».
- Toutes les animations sont coupées avec « réduire les animations » (CSS `prefers-reduced-motion` et test JavaScript pour le solde). Aucune évolution de la base.
- Tests : `src/lib/predictions/results.test.ts`, `src/server/resultats-onglet.db.test.ts`, E2E `slice24-animation.spec.ts`.

## Stories de club et « à la une » (tranche 27, `src/server/stories.ts`, `src/lib/stories.ts`, `src/components/stories-bar.tsx`)

- **Story** : texte de 1 à 280 caractères sur un fond de couleur du thème (vert Ralli, vert action, terre battue, or, vert pâle), **visible 24 h** par les membres du club seulement, jamais publique. Mots interdits (pari, mise, bookmaker, euro) refusés à la publication. Pas d'image importée.
- **Qui publie** : un admin pour tout le club, un capitaine pour son équipe (étiquette « Équipe », visible de tout le club). Seul l'admin peut cocher « Aussi à la une du club ». Aperçu puis « Publier pour … ? » avant l'envoi ; une story n'est pas modifiable.
- **Bandeau** (haut de l'accueil et de la page du club) : « + » pour les admins et capitaines, puis un rond par club et par équipe ayant une story vivante ; liseré doré (`accent`) tant qu'il reste une story non vue, les non vues d'abord. Lecteur plein écran (touche droite = suivante, gauche = précédente, pas de lecture automatique) ; une story est « vue » dès qu'elle s'affiche (`StoryView`). L'auteur et les admins voient « Vue par N membres » (le nombre).
- **« À la une » du club = collections** (comme les « à la une » d'Instagram) : sur la page du club, sous le bandeau de stories, une rangée « « À la une » du club » avec un rond nommé par collection (initiale du nom, couleur de la dernière story, ★ sur l'épinglée). Toucher un rond ouvre en plein écran toutes les stories de la collection, de la plus ancienne à la plus récente, même après leurs 24 h. Tous les membres les lisent ; la rangée n'existe que s'il y a au moins une collection.
- **Qui les crée** (admins seulement) : à la publication (case « Aussi à la une du club » : choisir une collection existante ou « Nouvelle collection… » avec son nom, 1 à 40 caractères, unique dans le club sans tenir compte de la casse) ou depuis une story déjà publiée (bouton « Ajouter à la une » dans le lecteur ; « Retirer de la une » avec confirmation, la story reste visible jusqu'à ses 24 h). Une story expirée ou supprimée ne peut plus être ajoutée. Une collection sans story disparaît.
- **Commandes d'admin dans une collection** : « Épingler en premier » / « Désépingler » (une seule épinglée par club, garanti par un index unique, l'épinglée est la première de la une), « Supprimer la collection » (avec confirmation ; les stories ne sont pas supprimées). Tables `StoryCollection` et `Story.collectionId` (migration `20261012180000_story_collections`, qui reprend les anciennes publications de la une).
- **Suppression** : l'auteur ou un admin du club, avec confirmation ; la ligne reste en base (`deletedAt`, `deletedById`), invisible des membres. Pas de purge automatique des anciennes lignes pour l'instant.
- **Base** : tables `Story` et `StoryView` (migration `20261012100000_stories`), type `WIN_CARD` déjà prévu pour la tranche 28 (rallis gagnants, réactions, signalement).
- **Démo** : `seed:demo` ajoute une collection épinglée « Interclubs de la saison » à la une de Lyon, une story de Messieurs 1 et une annonce de Nantes déjà vue par `parieur1` (les stories de la démo disparaissent 24 h après le chargement ; la une reste).

## Annuaire des clubs (tranche 29, `src/server/club-directory.ts`, `src/lib/clubs/search.ts`, pages `/clubs/recherche` et `/clubs/[clubId]`)

- **Les clubs sont publics** : tout compte connecté les cherche, consulte leur fiche, « à la une », leurs rencontres à venir (avec matchs, joueurs « Prénom N. » et cotes) et leurs résultats récents, et peut les **rejoindre d'un bouton** (« Rejoindre le club », sans code, sans confirmation). Seuls les membres pronostiquent ; la page d'une rencontre propose « Rejoindre le club » aux non-membres. Un non-membre ne voit pas : les stories, la liste des membres, le classement. Sans compte, rien (pages privées, non indexées).
- **« Suivre » = être membre** : « X personnes suivent ce club » (`followersLabel`, « Sois le premier à suivre ce club » à zéro) sur la page du club, pour les membres comme les non-membres, et sur chaque résultat de recherche.
- **Recherche** : barre en haut de l'accueil et page `/clubs/recherche?q=` (onglet **Clubs** de la barre du bas, 4e place, icône d'épingle de carte). Par nom, ville ou code postal, sans accents ni casse, tous les mots doivent correspondre ; sans saisie, tous les clubs, les plus suivis d'abord (50 au plus). Chaque carte : logo, nom, code postal et ville, compteur, pastille « Membre ».
- **Mes clubs** : l'ancien contenu de l'onglet Club est dans le profil : « Voir mes clubs » mène directement au club si on n'en a qu'un, sinon à `/clubs` (liste « Mes clubs » avec « Rechercher un club » et « Je suis admin d'un club »). « Classement » mène toujours au classement du club unique, ou à la liste.
- **Quitter le club** (bouton en bas de la page du club, avec confirmation ; les pronostics en cours restent valables). Refusé pour : le dernier admin, un capitaine d'équipe (un admin doit d'abord changer de capitaine), un joueur lié à un compte aligné dans une rencontre `OPEN` ou `SCORE_PROPOSED` (anti-trucage). Sinon la fiche de joueur est déliée du compte.
- **Logo et fiche** : lisibles de tout compte connecté (avant : membres seulement). **Guide** : l'étape « Clubs » est réécrite.
- **Carte et filtres** : voir la section suivante (tranche C).

## Carte des clubs (tranche C, `src/components/club-map.tsx`, `src/lib/clubs/{region,size,geocode,map}.ts`, pages `/clubs/recherche` et `/clubs/carte`)

- **Où** : sur `/clubs/recherche` (onglet **Clubs**), un **aperçu** de la carte (non déplaçable) sous la barre de recherche ; le toucher ouvre la carte agrandie `/clubs/carte` (bouton « ‹ Retour à la liste »). La recherche `?q=` et les filtres passent d'une page à l'autre dans l'adresse.
- **Carte** : Leaflet + tuiles publiques OpenStreetMap (gratuit, sans clé ; mention « © OpenStreetMap » affichée). Épingles groupées en pastille avec un nombre (`leaflet.markercluster`) ; toucher une épingle ouvre une petite fenêtre : nom (lien vers le club), code postal et ville, « X personnes suivent ce club ». Les fenêtres sont construites en DOM (`textContent`) : un nom de club n'est jamais interprété comme du HTML. La carte s'ajuste sur les épingles visibles (zoom 12 au plus), centrée sur la France sans épingle.
- **Qui est sur la carte** : les clubs dont l'adresse a été localisée. Les autres restent dans la liste (« N sans adresse localisée »). Adresse exacte du club (pas de brouillage : c'est un club, pas une personne).
- **Filtres** (en pastilles arrondies posées en haut de la carte agrandie, `club-map-filters.tsx` : « Par région », « Par taille », « Rencontre à venir », « Effacer » ; ils s'appliquent dès qu'on change un choix et passent dans l'adresse `?region=&taille=&avenir=1`, que la liste lit aussi ; pas de filtres sur la liste elle-même) : **région** (13 régions métropolitaines + Guadeloupe, Martinique, Guyane, La Réunion, Mayotte), **taille** par nombre de **licenciés** de la fiche (petit < 100, moyen 100 à 299, grand ≥ 300 ; sans licenciés renseignés, le club n'est dans aucune taille), **rencontre à venir** (au moins une rencontre publiée `OPEN`, non archivée, qui n'a pas commencé). Un club sans région ne passe pas le filtre de région.
- **Position et région** : calculées à l'enregistrement de la fiche (`updateClubProfile`). Position = API adresse de l'État (`api-adresse.data.gouv.fr`, délai 4 s, meilleure correspondance, score ≥ 0,4) ; région = code postal (2 premiers chiffres, 3 pour l'outre-mer, 200 à 206 = Corse). Nouveau calcul quand l'adresse, le code postal ou la ville change, ou tant que le club n'est pas localisé. **L'enregistrement n'est jamais bloqué** : adresse introuvable ou service en panne = pas d'épingle et le message « Fiche enregistrée, mais adresse non localisée sur la carte : vérifie l'adresse. » reste affiché (rouge). Adresse vidée = épingle retirée.
- **Base** : `Club.latitude`, `Club.longitude`, `Club.region` (facultatifs, CHECK : les deux positions ensemble, dans les limites). Migration `20261013150000_club_map`.
- **Clubs existants** : `npm run geocode-clubs` localise une fois ceux qui ont une adresse sans position (1 requête par seconde, ne touche pas les clubs déjà localisés). Ne tourne que sur demande.
- **Tests** : unitaires `region`, `size`, `geocode`, `map`, `search` (filtres) ; `club-profile.db.test.ts` (région, position, nouveau calcul seulement si l'adresse change, adresse introuvable, CHECK) ; E2E `slice31-carte.spec.ts`.

## Retrait d'un membre et demande de retour (tranche 30, `src/server/club-directory.ts`, table `ClubRemoval`)

- **Qui** : un admin du club retire un **membre simple** (bouton « Retirer du club » dans la section Membres, avec confirmation). Refusé : soi-même (il y a « Quitter le club »), un admin (lui retirer d'abord son rôle), un capitaine d'équipe (« Désigne d'abord un autre capitaine pour X »). Capitaines et membres n'ont pas ce droit.
- **Effets** : l'adhésion disparaît (il ne compte plus parmi les personnes qui suivent le club, ni dans les membres et le classement du club). Ses pronostics en cours restent valables et réglés normalement ; le lien avec sa fiche de joueur reste en place. Aucune notification (pas d'email) : il le voit en ouvrant la page du club.
- **Revenir** : une ligne `ClubRemoval` (`userId`, `clubId`, `removedAt`, `removedById`, `requestedAt`) bloque « Rejoindre le club » en un clic (`REMOVED_FROM_CLUB`). Sur la page du club, la personne voit « Demander à revenir » (`requestedAt` rempli = demande en attente, une seule à la fois). Les admins voient « Demandes pour revenir (n) » avec « Accepter » (la personne redevient membre simple, la ligne est supprimée) ou « Refuser » (elle reste retirée, la demande disparaît, elle peut redemander). Quitter soi-même ne crée pas de ligne : on peut revenir d'un clic.
- **Tests** : `club-directory.db.test.ts` (retrait, droits, capitaine, lien joueur, demande, accepter, refuser), E2E `slice30-retrait-membre.spec.ts`, `slice16-invitations.spec.ts` réécrit ; les tests qui rejoignaient par code utilisent `joinClub` (Vitest) ou `joinClubById` (E2E, `tests/e2e/helpers.ts`).

## Documents

- [EXCLUSIONS.md](EXCLUSIONS.md) : ce qui est volontairement hors MVP.
