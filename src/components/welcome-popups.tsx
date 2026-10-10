import { getCurrentUser } from "@/lib/auth/current-user";
import { listMyClubs } from "@/server/clubs";
import { getUnseenResults } from "@/server/onboarding";
import { DailyBonusPopup } from "./daily-bonus-popup";
import { OnboardingGuide } from "./onboarding-guide";
import { ResultsRecapDialog } from "./results-recap";

/**
 * Fenêtres d'accueil d'un compte connecté (mot de passe non provisoire), jamais deux à la fois, dans cet ordre :
 * 1. le guide du premier lancement, 2. le récapitulatif des pronostics réglés, 3. le bonus de connexion du jour.
 * Chaque fenêtre rafraîchit la page en se fermant : la suivante prend alors sa place.
 */
export async function WelcomePopups() {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return null;
  if (!user.onboardingSeenAt) return <OnboardingGuide key="guide" hasClub={(await listMyClubs(user.id)).length > 0} />;
  const recap = await getUnseenResults(user.id);
  if (recap) return <ResultsRecapDialog key={`recap-${recap.cutoff}`} recap={recap} />;
  return <DailyBonusPopup key="daily" />;
}
