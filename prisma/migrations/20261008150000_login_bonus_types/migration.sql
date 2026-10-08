-- Bonus de connexion quotidienne (+10) et bonus de série de 7 jours (+50).
-- Les valeurs sont ajoutées ici, et utilisées dans la migration suivante : PostgreSQL interdit d'employer
-- une valeur d'énumération dans la transaction qui vient de l'ajouter.
ALTER TYPE "LedgerType" ADD VALUE 'DAILY_LOGIN_BONUS';
ALTER TYPE "LedgerType" ADD VALUE 'STREAK_BONUS';
