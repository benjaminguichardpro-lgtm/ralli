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
- Design : couleurs uniquement via les tokens de `src/app/globals.css` (aucune couleur en dur), boutons ≥ 44 px, contraste AA (`npm run contrast`).

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
| 10. Écrans (design soigné, partage WhatsApp) | **prochaine** | |
| 11. Seed de démo et tests E2E | | |

État des tests au dernier commit : 371 tests Vitest, 54 scénarios Playwright, tous verts.

## Décisions prises (en plus du brief)

**Comptes et clubs** : mot de passe ≥ 8 caractères (≤ 72 octets) ; pseudo 3 à 20 caractères, unique sans tenir compte de la casse ; connexion avec l'email OU le pseudo dans un seul champ (un pseudo ne contient jamais « @ ») ; 1000 Aces à l'inscription (ledger) ; pas d'email, donc dépannage par `npm run reset-password -- <email>` (mot de passe temporaire, changement forcé). Le créateur d'un club en est admin ; adhésion par code de 6 caractères sans 0/O/1/I ; **code visible des admins seulement** ; un club garde au moins un admin ; confirmation avant de retirer un rôle admin (le sien ou celui d'un autre). Un utilisateur peut être membre de plusieurs clubs.

**Équipes et joueurs** : l'admin crée les équipes du club avec un capitaine obligatoire. Équipes adverses (EXTERNAL) créées par l'admin ou un capitaine. Effectif géré par l'admin et le capitaine de l'équipe (équipe adverse : admin et tout capitaine). Un joueur peut être dans plusieurs équipes du club. Fiche supprimable seulement si jamais alignée. Lien fiche ↔ compte posé par l'admin ou le capitaine ; création ET retrait du lien refusés si le joueur est dans une rencontre OPEN (couvre LOCKED) ou SCORE_PROPOSED non réglée (DISPUTED volontairement non inclus).

**Cotes** : rating = rang FFT × 100 (NC = 0 … 1re série = 2400) ; forme = (V − D) × 10 sur les 5 derniers matchs ; H2H = (V A − V B) × 15 ; écart unique d ; P(A) = 1 / (1 + 10^(−d/400)) ; **bornes symétriques P ∈ [0,12 ; 0,88]**, cotes de 1,14 à 8,33 ; cote stockée en centièmes entiers ; historique = matchs joués et abandons (WO et non joués ignorés). Constantes non calibrées dans `src/config/odds.ts`. Remarque connue : les bornes sont atteintes dès 4 échelons d'écart (à recalibrer plus tard). Gain = `computePayout` : floor((engagés × oddsX100 + 50) / 100).

**Rencontres** : adversaire toujours pris dans la liste des équipes adverses du club (pas de liaison entre deux clubs Ralli : le score est confirmé par deux personnes distinctes du club organisateur, admin ou capitaine). Création par le capitaine de l'équipe ou un admin, qui choisit domicile ou extérieur. 1 à 8 simples, un simple par joueur. Publication : au moins un match, début futur, cotes figées. Avant le début : ajout, modification (match remplacé, pronostics remboursés), retrait et report possibles. Après le début : report possible mais les pronostics restent fermés (`predictionsCloseAt`). Annulation (brouillon, ouverte, verrouillée) par le capitaine de l'équipe du club ou un admin, avec remboursement. Brouillon visible des admins et capitaines ; page publique ensuite (« Prénom N. », noindex, identifiant cuid).

## À faire ensuite

- **Tranche 10 (écrans, design soigné, partage WhatsApp)** : demander à Benjamin 2 ou 3 apps de référence, puis proposer une maquette (couleurs via les tokens, boutons ≥ 44 px) avant de coder. Tranche 9 faite : `src/server/leaderboard.ts`, `src/lib/leaderboard/rank.ts`, `src/config/season.ts` (dates de saison à revoir après le pilote), page `/clubs/<id>/classement`.
- Les tests de concurrence (double engagement simultané) devront être refaits sur un vrai Postgres (PGlite traite les requêtes une à une).
- Neon (staging et prod) : plus tard, procédure dans le README.
- Design plus moderne prévu en tranche 10 : demander à Benjamin 2 ou 3 apps de référence, puis proposer une maquette avant de coder.
