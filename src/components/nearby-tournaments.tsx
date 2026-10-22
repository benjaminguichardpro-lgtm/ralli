import Link from "next/link";
import { radiusPhrase } from "@/lib/geo";
import type { NearbyTournamentsResult } from "@/server/nearby-tournaments";
import { PostalCodeForm } from "./location-forms";
import { TournamentList } from "./tournament-list";

/**
 * Onglet « Tournoi à venir » : les tournois publiés et pas terminés des clubs retenus par la barre de distance (affichée au-dessus, sous les
 * onglets), le plus proche d'abord. Un tournoi publié se suit sans être membre ; seuls les membres le pronostiquent.
 */
export function NearbyTournamentsList({ result }: { result: NearbyTournamentsResult }) {
  const { radiusKm, tournaments } = result;
  if (result.needsLocation) {
    return (
      <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm" data-testid="tournaments-needs-location">
        <h2 className="font-serif text-xl text-primary">Où es-tu ?</h2>
        <p className="text-ink-muted">Indique le code postal de ta ville pour voir les tournois près de chez toi. « Mes clubs » et « France » n&apos;en ont pas besoin.</p>
        <PostalCodeForm submitLabel="Valider" />
      </div>
    );
  }
  if (tournaments.length === 0) {
    return (
      <div className="space-y-3 rounded-2xl bg-surface p-5 shadow-sm" data-testid="home-tournaments-empty">
        <h2 className="font-serif text-xl text-primary">Pas de tournoi à venir</h2>
        <p className="text-ink-muted">Aucun tournoi publié {radiusPhrase(radiusKm)} pour l&apos;instant. Élargis la distance ci-dessus : les tournois sont ouverts à tous.</p>
        <Link href="/clubs/carte" className="inline-flex min-h-11 items-center font-semibold text-primary underline">
          Voir la carte des clubs
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm" data-testid="home-tournaments-current">
      <TournamentList items={tournaments} empty="" showClub />
    </div>
  );
}
