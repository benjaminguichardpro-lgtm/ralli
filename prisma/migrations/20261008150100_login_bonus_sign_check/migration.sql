-- Le contrôle de signe du ledger doit connaître les deux nouveaux types (montants strictement positifs).
ALTER TABLE "LedgerEntry" DROP CONSTRAINT "LedgerEntry_amount_sign_check";
ALTER TABLE "LedgerEntry"
  ADD CONSTRAINT "LedgerEntry_amount_sign_check" CHECK (
    ("type" = 'PREDICTION_COMMIT' AND "amount" < 0)
    OR ("type" IN ('SIGNUP_BONUS', 'WEEKLY_BONUS', 'DAILY_LOGIN_BONUS', 'STREAK_BONUS', 'PREDICTION_PAYOUT', 'PREDICTION_REFUND') AND "amount" > 0)
  );
