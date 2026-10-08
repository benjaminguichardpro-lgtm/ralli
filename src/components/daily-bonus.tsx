import { getCurrentUser } from "@/lib/auth/current-user";
import { DailyBonusPopup } from "./daily-bonus-popup";

/** Popup du bonus de connexion : seulement pour un compte connecté dont le mot de passe n'est pas provisoire. */
export async function DailyBonus() {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return null;
  return <DailyBonusPopup />;
}
