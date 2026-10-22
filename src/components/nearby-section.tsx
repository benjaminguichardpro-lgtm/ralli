import Link from "next/link";
import { formatDistance, radiusPhrase, radiusTitle } from "@/lib/geo";
import { formatParisDay, formatParisTime, relativeDayLabel } from "@/lib/time";
import { listNearbyEncounters } from "@/server/nearby";
import { ClubLogo } from "./club-logo";
import { StatusBadge } from "./encounter-list";
import { type NearbyResult } from "@/server/nearby";
import { DistanceBar } from "./distance-bar";
import { PostalCodeForm } from "./location-forms";

/**
 * Page « Interclub à proximité » (ouverte depuis la recherche de clubs) : la barre de distance, puis les rencontres. Sur l'accueil,
 * la barre est sous les onglets et la liste (`NearbyEncounterList`) remplace le fil dès qu'on s'éloigne de « Mes clubs ».
 */
export async function NearbySection({ userId, now = new Date() }: { userId: string; now?: Date }) {
  const result = await listNearbyEncounters(userId, now);
  return (
    <div className="space-y-4" data-testid="nearby">
      <DistanceBar radiusKm={result.radiusKm} kind="interclubs" scope={radiusTitle(result.radiusKm, result.commune)} count={result.needsLocation ? null : result.encounters.length} noun="interclub" />
      <NearbyEncounterList result={result} now={now} />
    </div>
  );
}

/** Les interclubs du rayon choisi (la plus proche dans le temps d'abord) ; sans code postal pour un rayon en km, le formulaire du code postal. */
export function NearbyEncounterList({ result, now }: { result: NearbyResult; now: Date }) {
  const { encounters, radiusKm } = result;
  return (
    <>
      {result.needsLocation ? (
        <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm" data-testid="nearby-needs-location">
          <h2 className="font-serif text-xl text-primary">Où es-tu ?</h2>
          <p className="text-ink-muted">Indique le code postal de ta ville pour voir les interclubs près de chez toi. « Mes clubs » et « France » n&apos;en ont pas besoin.</p>
          <PostalCodeForm submitLabel="Valider" />
        </div>
      ) : encounters.length === 0 ? (
        <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm" data-testid="nearby-empty">
          <p className="font-semibold">Aucune rencontre {radiusPhrase(radiusKm)} pour l&apos;instant.</p>
          <p className="text-sm text-ink-muted">
            Élargis la distance ci-dessus, ou regarde la carte des clubs. Seuls les clubs dont l&apos;adresse est localisée sur la carte sont pris en compte.
          </p>
          <Link href="/clubs/carte" className="inline-flex min-h-11 items-center font-semibold text-primary underline">
            Voir la carte des clubs
          </Link>
        </div>
      ) : (
        <ul className="space-y-3" data-testid="nearby-list">
          {encounters.map((e) => {
            const rel = relativeDayLabel(e.startsAt, now);
            return (
              <li key={e.id}>
                <Link
                  href={`/rencontres/${e.id}`}
                  data-testid="nearby-encounter"
                  className="block space-y-1 rounded-2xl bg-surface p-4 shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-semibold">
                      {e.home} – {e.away}
                    </span>
                    <span className="font-data font-bold text-accent">
                      {formatParisTime(e.startsAt)}
                      <span className="font-sans text-sm font-medium"> · {rel ?? formatParisDay(e.startsAt)}</span>
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                    <ClubLogo club={e.club} size={24} />
                    <span>{e.club.name}</span>
                    {e.distanceKm !== null && <span data-testid="nearby-distance">· {formatDistance(e.distanceKm)}</span>}
                  </span>
                  <span className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                    <StatusBadge status={e.status} label={e.statusLabel} />
                    {e.matchCount} match{e.matchCount > 1 ? "s" : ""}
                    {e.isMember && <span className="rounded-full bg-pale px-2.5 py-0.5 text-xs font-bold text-primary">Membre</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
