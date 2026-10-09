# Ralli : contexte de reprise pour Claude Code

Web app mobile-first de pronostics sur les interclubs de tennis amateur, en Aces (monnaie fictive). Objectif MVP : tester l'adoption avec 2 ou 3 clubs réels sur une journée d'interclubs. Interlocuteur : Benjamin, porteur du produit, **non développeur**.

À lire aussi : [README.md](README.md) (règles détaillées, commandes, modèle de cotes) et [EXCLUSIONS.md](EXCLUSIONS.md).

## Façon de travailler (imposée par le brief)

- **Tranches verticales**, une à la fois. Avant chaque tranche : présenter les règles à trancher, numérotées, avec une recommandation pour chacune, puis **attendre la réponse**. Ne jamais deviner une règle métier : poser la question.
- **Fin de tranche** : exécuter réellement `npm test`, `npx tsc --noEmit`, `npm run build` (+ `npm run test:e2e`, `npm run lint`, `npm run db:verify`) et coller la sortie brute. Test Playwright multi-rôles, puis donner à Benjamin une **liste d'étapes de test manuel** très concrète (quel compte, quel bouton, quel résultat attendu).
- **Contre-vérifier les tests** : casser volontairement une règle (mutation) pour prouver qu'un test échoue, puis restaurer le code.
- **Git** : un commit par tranche **après validation explicite** de Benjamin, message en deux parties « Fait » / « Vérifié », puis `git push` (fonctionne sans mot de passe, identifiant rangé dans le trousseau pour ce dépôt). Jamais de commit fourre-tout.
- **Schéma Prisma** : montrer toute évolution avant de migrer.
- **Style de réponse** : français simple, peu de jargon, explications pas à pas. Benjamin apprécie les confirmations avant les actions destructives dans l'UI.

## Contraintes dures

- Aucun argent réel : Aces non achetables, non convertibles, aucun lot, aucune pub.
- Vocabulaire interdit dans l'UI : « pari », « mise », « gain en euros », « bookmaker ». Utiliser « pronostic », « Aces engagés », « Aces gagnés », « cote ». Contrôlé par `findForbiddenWords` sur le texte affiché (tests E2E), pas sur le code source.
- 18+ : case obligatoire à l'inscription, mention en pied de page.
- Anti-trucage côté serveur : ne peuvent pas pronostiquer une rencontre les capitaines des deux équipes, les joueurs alignés dans un de ses matchs et les comptes liés à ces joueurs, ainsi que les admins du club concerné.
- Design : voir `docs/DESIGN.md` ; couleurs uniquement via les tokens de `src/app/globals.css` (aucune couleur en dur), boutons ≥ 44 px, contraste AA (`npm run contrast`).

## Stack et environnement

- Next.js 16.4 (App Router, `cacheComponents` activé : toute lecture de session, base ou heure se fait derrière `<Suspense>` ; `await connection()` avant `auth()`). Lire la doc dans `node_modules/next/dist/docs/` avant d'utiliser une API Next (voir AGENTS.md).
- TypeScript strict, Tailwind v4, Prisma 7.10 (adaptateur `pg`, client généré dans `src/generated/prisma`), Auth.js v5 bêta (credentials, JWT), zod 4, Vitest 5 (projets `unit` et `db`), Playwright.
- **Bases locales** via `prisma dev` (pas de Docker, pas encore de compte Neon) : dev = `npm run db:start`, port 51214 ; test = `npm run db:test:start`, port 51218. Les ports sont attribués à la création et stables (`npm run db:ls`). Les tests vident la base de test (TRUNCATE).
- `.env` et `.env.test` sont locaux, hors git (modèles : `.env.example`, `.env.test.example`).
- `gh` n'est pas installé ; remote `origin` = https://github.com/benjaminguichardpro-lgtm/ralli.git (privé).
- **Le projet est dans `~/Documents`, synchronisé par iCloud** (décision : on reste là). iCloud peut créer des copies « fichier 2 » (déjà vu dans `.next` et `node_modules`). Si `tsc` ou le build échouent bizarrement, chercher les fichiers `* 2*` hors `node_modules` avant de soupçonner le code.
- Le serveur de dev doit être relancé après un `prisma generate` (sinon client Prisma périmé).

## Avancement

| Tranche | État | Commit |
|---|---|---|
| 1. Setup, thème, schéma, migration | ✅ | 42b2b7b |
| 2. Comptes, connexion, clubs, rôles (+ confirmations admin) | ✅ | ce5c926, 89fdd9a |
| 3. Équipes et joueurs (niveau FFT) | ✅ | 9abc307 |
| 4. Module de cotes pur | ✅ | 24207d3 |
| 5. Rencontres et matchs | ✅ | 174324a |
| 6. Pronostics et portefeuille (bonus du lundi inclus) | ✅ | voir `git log` |
| 7. Workflow de scores | ✅ | voir `git log` |
| 8. Règlement atomique et idempotent | ✅ | voir `git log` |
| 9. Classements | ✅ | voir `git log` |
| 10. Écrans (design soigné, partage WhatsApp) | ✅ | voir `git log` |
| 11. Seed de démo et tests E2E | ✅ | voir `git log` |
| 12. Profil et avatars (bannière aérée) | ✅ | e8b2d75, 1eed44b |
| 13. Archivage des rencontres (croix rouge) | ✅ | 6b9a106 |
| 14. Doubles (2 contre 2), points par match | ✅ | 4ca7bc8 |
| 15. Filtre des rencontres, victoire / défaite / nul | ✅ | 93d63ce |
| 16. Lien d'invitation, écrans vides (**partielle** : guide du premier lancement non fait, attend la migration `onboardingSeenAt`) | ✅ partielle | voir `git log` |
| 17. Partage WhatsApp d'une rencontre, récapitulatif des pronostics réglés | à faire | |

État des tests (fin de tranche 15) : 496 tests Vitest, 109 scénarios Playwright, tous verts.

## Décisions prises (en plus du brief)

**Comptes et clubs** : mot de passe ≥ 8 caractères (≤ 72 octets) ; pseudo 3 à 20 caractères, unique sans tenir compte de la casse ; connexion avec l'email OU le pseudo dans un seul champ (un pseudo ne contient jamais « @ ») ; 1000 Aces à l'inscription (ledger) ; pas d'email, donc dépannage par `npm run reset-password -- <email>` (mot de passe temporaire, changement forcé). Le créateur d'un club en est admin ; adhésion par code de 6 caractères sans 0/O/1/I ; **code visible des admins seulement** ; un club garde au moins un admin ; confirmation avant de retirer un rôle admin (le sien ou celui d'un autre). Un utilisateur peut être membre de plusieurs clubs.

**Équipes et joueurs** : l'admin crée les équipes du club avec un capitaine obligatoire. Équipes adverses (EXTERNAL) créées par l'admin ou un capitaine. Effectif géré par l'admin et le capitaine de l'équipe (équipe adverse : admin et tout capitaine). Un joueur peut être dans plusieurs équipes du club. Fiche supprimable seulement si jamais alignée. Lien fiche ↔ compte posé par l'admin ou le capitaine ; création ET retrait du lien refusés si le joueur est dans une rencontre OPEN (couvre LOCKED) ou SCORE_PROPOSED non réglée (DISPUTED volontairement non inclus).

**Cotes** : rating = rang FFT × 100 (NC = 0 … 1re série = 2400) ; forme = (V − D) × 10 sur les 5 derniers matchs ; H2H = (V A − V B) × 15 ; écart unique d ; P(A) = 1 / (1 + 10^(−d/400)) ; **bornes symétriques P ∈ [0,12 ; 0,88]**, cotes de 1,14 à 8,33 ; cote stockée en centièmes entiers ; historique = matchs joués et abandons (WO et non joués ignorés). Constantes non calibrées dans `src/config/odds.ts`. Remarque connue : les bornes sont atteintes dès 4 échelons d'écart (à recalibrer plus tard). Gain = `computePayout` : floor((engagés × oddsX100 + 50) / 100).

**Rencontres** : adversaire toujours pris dans la liste des équipes adverses du club (pas de liaison entre deux clubs Ralli : le score est confirmé par deux personnes distinctes du club organisateur, admin ou capitaine). Création par le capitaine de l'équipe ou un admin, qui choisit domicile ou extérieur. Simples et doubles (2 contre 2, équipe seulement), sans limite du nombre de matchs, au plus un simple et un double par joueur ; chaque match vaut 1 ou 2 points au score final. Publication : au moins un match, début futur, cotes figées. Avant le début : ajout, modification (match remplacé, pronostics remboursés), retrait et report possibles. Après le début : report possible mais les pronostics restent fermés (`predictionsCloseAt`). Annulation (brouillon, ouverte, verrouillée) par le capitaine de l'équipe du club ou un admin, avec remboursement. Brouillon visible des admins et capitaines ; page publique ensuite (« Prénom N. », noindex, identifiant cuid).

## État du design (tranche 10 et après, voir `docs/DESIGN.md`)

- **Accueil** : une carte par rencontre (la prochaine en grand avec l'heure, « Pronostiquer › »). Ni joueurs ni cotes sur l'accueil : on touche la carte, puis la cote sur la page de la rencontre, puis le panneau du bas (montants 50 / 100 / 250 / Tout), bouton **« Valider mon ralli »**. La case touchée se remplit de terre battue `#b4502b` avant le panneau (animation 350 ms, instantanée avec « réduire les animations »).
- **Palette** de la démo Ralli (vert Ralli `brand`, vert action `primary`, or `gold` sur vert et `accent` sur clair, `pale`, `clay`). **Polices** : Norican (logo), Cormorant Garamond (titres, noms, grands chiffres), DM Sans (le reste). Ces choix viennent de Benjamin : ne pas les modifier sans son accord.
- **Mode sombre : pas implémenté.** Benjamin a donné fond `#0c1912` et boutons `#7fdba6` ; j'ai proposé le reste (cartes `#14271d`, pâle `#1d3a2b`, bordures `#2f4d3d`, texte `#e8f1ea` / `#a7bbad`, en-tête `#154a33`, carte « prochaine rencontre » `#1b5a3c`, or `#e6c872`, gagné `#4fbf80`) : **en attente de sa validation**. La cote sélectionnée doit passer en texte foncé sur vert clair.
- **Barre du bas** (connecté) : Matchs, Classement, Portefeuille, Club ; avec un seul club, Classement et Club y mènent directement, sinon `/classement` et `/clubs` listent les clubs. Solde toujours en haut (relu à chaque navigation).

## À faire ensuite

- **Tranche 11 faite** : `npm run seed:demo` (`scripts/seed-demo.ts`, logique dans `src/server/demo-seed.ts`), détail dans le README, section « Démo ». Décisions de Benjamin : base locale uniquement, 2 clubs + un club vide, mot de passe commun `demo-ralli-2026`, dates relatives, pronostics posés par les vraies fonctions, rencontres contestée et annulée incluses, contraste = `npm run contrast` suffit. Le `--reset` vide **toute** la base (ledger append-only). Design de la tranche 10 : `docs/DESIGN.md`, `src/components/match-picks.tsx`, `tab-bar.tsx`, `balance-pill.tsx`, `src/server/feed.ts`, pages `/clubs` et `/classement`.
- **Tranche 12 faite** : avatars (12 personnages SVG dans `public/avatar/`, photo importée dans le dossier `avatar/`), page `/profil`, bannière aérée, avatars dans classement et liste des membres ; détail dans le README, section « Profil et avatars ». Décisions de Benjamin : avatars de tennis stylisés (pas de portraits réels), dossier `avatar/` pour les photos, recadrage automatique au centre, « Mon profil » = l'avatar tout à droite de la bannière. **Limite connue** : le dossier `avatar/` ne marche pas sur Vercel, il faudra un stockage de fichiers avant la mise en ligne (un seul fichier à changer : `src/server/avatar-storage.ts`). Les photos peuvent être signalées/retirées par les admins du club.
- **Tranche 13 faite** : archivage des rencontres terminées ou annulées (croix rouge, section « Archives », réversible, pour tout le club ; admins et capitaines de l'équipe), détail dans le README. Hors tranche, demandé par Benjamin : code d'invitation masqué jusqu'à « Révéler le code d'invitation », bouton « Importer une photo » sous l'avatar. Benjamin veut être **tutoyé**.
- **Tranche 14 faite** : doubles, détail dans le README, section « Doubles ». Décisions de Benjamin : uniquement des joueurs de l'équipe ; un joueur peut jouer un simple et un double ; **aucune limite du nombre de matchs** (dépend du niveau) ; chaque match vaut **1 ou 2 points** au choix du club (l'écran ne le propose que pour les doubles, un simple vaut 1 : à étendre si besoin) ; cotes du double = moyenne des niveaux, sans forme ni confrontations ; affichage et saisie du score comme un simple.
- **Tranche 15 faite** : filtre des rencontres par statut sur la page du club et badges Victoire / Défaite / Nul ; détail dans le README. Décisions de Benjamin : résultat vu du club (pas du lecteur), au total des points, statut Nul en cas d'égalité, un filtre « En cours » unique, archives sans filtre, brouillons seulement pour le staff.
- **Piège local** (tsc) : iCloud crée aussi des copies « fichier 2 » dans `.next` ; `tsconfig.json` les exclut maintenant, et `find .next -name "* [0-9]*"` permet de les supprimer.
- **Tranche 16 (partielle)** : lien d'invitation `/rejoindre/CODE`, bouton « Inviter par WhatsApp » (admin), écrans vides selon le rôle ; détail dans le README. Décisions de Benjamin : tout selon mes recommandations (confirmation avant d'entrer dans un club, les membres simples ne voient jamais le code, partage de l'adresse d'inscription générale pour eux). **Reste** : guide du premier lancement + tranche 17, qui exigent deux colonnes sur `User` (`onboardingSeenAt`, `resultsSeenAt`, comptes existants marqués « vus ») : schéma montré à Benjamin, **pas encore validé**.
- **Neon (fait, 2026-10-09)** : projet `ralli` (Frankfurt, branche `production`, base `neondb`, Postgres 18). Adresses dans `.env.neon` (local, hors git). Migrations appliquées avec `npm run db:deploy` en chargeant ce fichier, 23/23 `db:verify`. La démo (mêmes comptes qu'en local) y a été chargée avec `seed:demo -- --base-distante=<serveur>`. Pour le pilote : repartir d'une base propre (nouvelle branche Neon), les comptes de démo ont un mot de passe public.
- **Vercel** : `vercel.json` déclare le cron du bonus du lundi. Variables à poser : `DATABASE_URL` (poolée), `DIRECT_URL`, `AUTH_SECRET`, `CRON_SECRET` ; pas de `DATABASE_POOL_MAX` ni `AUTH_TRUST_HOST`. **Photos importées : ne marchent pas** (disque en lecture seule), seuls les 12 avatars dessinés marchent.
- **Piège iCloud (vu le 2026-10-09)** : disque à 92 %, macOS « décharge » des milliers de fichiers (surtout `node_modules`) : ils ont la bonne taille mais un contenu vide, `next` s'arrête sans message. Remède : `rm -rf node_modules && npm ci`. **Ne pas** mettre `node_modules` en `.nosync` (lien symbolique) : Turbopack le résout et fait échouer le build.
- **Après la tranche 17** : pilote avec 2 ou 3 clubs réels ; stockage des photos et tests de concurrence sur vrai Postgres restent à faire.
- **Bonus de connexion** (hors tranches, demandé par Benjamin) : +10 Aces par jour à la première ouverture (jour de Paris), +50 de plus tous les 7 jours d'affilée, rien le jour de l'inscription ; popup « Connexion quotidienne X/7 » (`src/components/daily-bonus-popup.tsx`) ; migrations `20261008150000_login_bonus_types` et `20261008150100_login_bonus_sign_check` (deux fichiers : Postgres interdit d'utiliser une valeur d'enum ajoutée dans la même transaction). Le bonus du lundi est conservé. Pour tester la popup d'un compte, il faut antidater `createdAt` (voir `backdateAccount` et `seedLoginStreak` dans `tests/e2e/helpers.ts`).
- **Piège local** : `prisma dev` se mélange quand plusieurs requêtes arrivent en même temps (« bind message supplies N parameters »). `DATABASE_POOL_MAX="1"` dans `.env` et `.env.test` impose une connexion unique ; à laisser vide avec Neon. `getCurrentUser` est mis en cache par requête (React `cache`).
- **Tests E2E** : un fichier par thème (`tests/e2e/slice2` à `slice11`), chacun avec ses propres pseudos (la base de test est partagée : deux fichiers ne doivent pas réutiliser le même pseudo). `forceStarted(url)` fait commencer une rencontre (aucun écran ne permet une date passée).
- Les tests de concurrence (double engagement simultané) devront être refaits sur un vrai Postgres (PGlite traite les requêtes une à une).
- Neon (staging et prod) : plus tard, procédure dans le README.
