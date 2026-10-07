# Exclusions assumées du MVP

Ces fonctionnalités sont volontairement absentes. Aucune n'est cachée : si elle n'est pas dans le périmètre du brief, elle est listée ici.

## Hors périmètre produit
- **Doubles** : seuls les simples sont gérés.
- **Tournois** : uniquement des rencontres d'interclubs.
- **Intégration FFT / Ten'Up** : les niveaux FFT sont déclarés à la main.
- **Juniors et mineurs** : inscription réservée aux 18 ans et plus (déclaration sur l'honneur, pas de contrôle d'identité).
- **Multi-saisons** : une seule saison, dont les dates sont fixées dans la config.
- **i18n** : français uniquement.
- **App native** : web app mobile-first uniquement.

## Hors périmètre légal et monétisation
- **Paiements, achat d'Aces, conversion, lots** : jamais. Les Aces n'ont aucune valeur.
- **Publicité, sponsors** : aucun.

## Comptes et communication
- **Emails et notifications push** : aucun envoi.
- **Vérification d'email** : non faite.
- **Mot de passe oublié** : pas de parcours en libre-service, puisqu'aucun email n'est envoyé. Pendant le pilote, dépannage par un opérateur avec `npm run reset-password -- <email>`, qui génère un mot de passe temporaire à changer à la connexion suivante.

## Données personnelles
- **Suppression de compte et export des données** : hors MVP. **À faire avant toute ouverture publique.**

## Modération et exploitation
- **Modération avancée** : pas d'outil de signalement ni de bannissement. Seuls les litiges de score sont arbitrés, par les admins de club.
- **Report d'une rencontre** : pas de changement de date. On annule (remboursement intégral) puis on recrée la rencontre.
- **Calibrage des cotes** : les constantes du modèle ne sont pas calibrées tant qu'aucun backtest n'a été fait.
