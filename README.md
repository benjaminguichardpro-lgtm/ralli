# Ralli

Web app mobile-first de pronostics sur les interclubs de tennis amateur, en Aces (monnaie fictive, sans valeur, non achetable, non convertible).
Jeu gratuit, sans argent réel, réservé aux 18 ans et plus.

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
| `npm test` | Tests unitaires (Vitest) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Build de production |
| `npm run contrast` | Affiche les ratios de contraste du thème (lus dans `src/app/globals.css`) |
| `npm run db:start` / `db:stop` | Démarre / arrête la base locale |
| `npm run db:migrate` | Crée/applique une migration (dev) |
| `npm run db:deploy` | Applique les migrations existantes |
| `npm run db:verify` | Prouve en base que le trigger du ledger et les CHECK fonctionnent (transaction annulée, rien n'est conservé) |

## Base de données

### Aujourd'hui : Postgres local via `prisma dev`

Pas de Docker ni de compte cloud : `npx prisma dev` lance un **vrai PostgreSQL 17** (PGlite, compilé en WebAssembly) en local. Triggers PL/pgSQL et contraintes CHECK y fonctionnent, ce qui a été vérifié avant la première migration.

- Démarrage : `npm run db:start`, qui lance `prisma dev --name ralli --detach` avec des ports fixes (51213 pour le serveur, 51214 pour la base, 51215 pour la base « shadow » des migrations).
- Arrêt : `npm run db:stop`. Les données persistent entre deux démarrages.
- `.env` : `DATABASE_URL` et `DIRECT_URL` pointent toutes deux sur `postgres://postgres:postgres@localhost:51214/template1?sslmode=disable` (voir `.env.example`). Ce sont les identifiants par défaut d'une base qui n'écoute que sur la machine locale.
- Limite connue : PGlite traite les requêtes une à une, sans vraie concurrence. Les tests de concurrence (double engagement simultané, par exemple) seront donc refaits sur un vrai Postgres avant le pilote.

### Plus tard : Neon (staging et prod)

Quand un compte Neon existera :

1. Créer un projet `ralli` en région Europe (Frankfurt), Postgres 17, avec une branche `main` (prod) et des branches enfants `dev` et `test`.
2. Pour chaque branche : `DATABASE_URL` = chaîne **poolée** (hôte en `-pooler`), `DIRECT_URL` = chaîne **directe**. L'app passe par le pooler (serverless), Prisma Migrate exige une connexion directe.
3. Appliquer les migrations avec `npm run db:deploy` (en prod : dans la commande de build Vercel).

## Règles métier notables

### Confirmation du score d'une rencontre contre une équipe externe
Une équipe **externe** représente un adversaire qui n'utilise pas Ralli (pas de capitaine dans l'app). Pour une rencontre contre une équipe externe, le score est proposé puis confirmé par **deux personnes distinctes**, chacune ayant le rôle **ADMIN** du club organisateur ou **capitaine** d'une équipe de ce club. La même personne ne peut jamais proposer et confirmer.

Entre deux équipes Ralli : un capitaine propose, le capitaine de l'autre équipe confirme ou conteste ; en cas de contestation, un admin de l'un des deux clubs tranche. Un admin peut confirmer à la place d'un capitaine adverse muet 48 h après la proposition.

### Anti-trucage (appliqué côté serveur)
Ne peuvent pas pronostiquer une rencontre : les capitaines des deux équipes, les joueurs alignés dans un de ses matchs et les comptes liés à ces joueurs, ainsi que les admins des clubs concernés. Les autres membres des effectifs le peuvent.

### Portefeuille
Le solde n'est jamais stocké : c'est la somme du ledger (`LedgerEntry`).

## Garde-fous en base (SQL manuel de la migration `init`)

Prisma ne sait pas les exprimer : ils sont ajoutés à la main à la fin de `prisma/migrations/20261007120000_init/migration.sql`. Vérification : `npm run db:verify`.

- **Ledger append-only** : un trigger `BEFORE UPDATE OR DELETE` sur `LedgerEntry` lève une erreur pour toute modification ou suppression de ligne. Une correction se fait par une nouvelle écriture, jamais en réécrivant l'historique.
- **TRUNCATE reste permis** : c'est un trigger de niveau ligne, que `TRUNCATE` ne déclenche pas. Cela sert à réinitialiser la base de test (`TRUNCATE ... CASCADE`). Ne jamais l’utiliser sur la prod.
- **CHECK** :
  - `Prediction.committedAces >= 10` ;
  - `Prediction.oddsX100` entre 100 et 1000 ;
  - `LedgerEntry.amount < 0` pour `PREDICTION_COMMIT`, `> 0` pour `SIGNUP_BONUS`, `WEEKLY_BONUS`, `PREDICTION_PAYOUT` et `PREDICTION_REFUND`.
- **Calcul du gain** : uniquement via `computePayout` (`src/lib/predictions/payout.ts`), en arithmétique entière : `floor((committedAces × oddsX100 + 50) / 100)`.

## Documents

- [EXCLUSIONS.md](EXCLUSIONS.md) : ce qui est volontairement hors MVP.
