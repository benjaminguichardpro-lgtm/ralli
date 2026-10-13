import Link from "next/link";
import { formatDistance } from "@/lib/geo";
import { formatParisDay, formatParisTime, relativeDayLabel } from "@/lib/time";
import { listNearbyEncounters } from "@/server/nearby";
import { ClubLogo } from "./club-logo";
import { StatusBadge } from "./encounter-list";
import { PostalCodeForm, RadiusForm } from "./location-forms";

/**
 * Rencontres à proximité de la personne : réglage du rayon, puis les rencontres (la plus proche dans le temps d'abord).
 * Utilisé par l'accueil (`?proximite=1`) et par la page `/rencontres/proximite`. Sans code postal enregistré (adresse tapée à la main),
 * le formulaire du code postal s'affiche à la place.
 */
export async function NearbySection({ userId, now = new Date() }: { userId: string; now?: Date }) {
  const result = await listNearbyEncounters(userId, now);
  if (!result) {
    return (
      <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm" data-testid="nearby-needs-location">
        <h2 className="font-serif text-xl text-primary">Où es-tu ?</h2>
        <p className="text-ink-muted">Indique le code postal de ta ville pour voir les rencontres près de chez toi.</p>
        <PostalCodeForm submitLabel="Valider" />
      </div>
    );
  }
  const { encounters, radiusKm, commune } = result;
  return (
    <div className="space-y-4" data-testid="nearby">
      <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm">
        <h2 className="font-serif text-xl text-primary" data-testid="nearby-title">
          À moins de {radiusKm} km{commune ? ` de ${commune}` : ""}
        </h2>
        <RadiusForm radiusKm={radiusKm} />
      </div>
      {encounters.length === 0 ? (
        <div className="space-y-3 rounded-2xl bg-surface p-4 shadow-sm" data-testid="nearby-empty">
          <p className="font-semibold">Aucune rencontre à moins de {radiusKm} km pour l&apos;instant.</p>
          <p className="text-sm text-ink-muted">
            Élargis le rayon ci-dessus, ou regarde la carte des clubs. Seuls les clubs dont l&apos;adresse est localisée sur la carte sont pris en compte.
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
                    <span data-testid="nearby-distance">· {formatDistance(e.distanceKm)}</span>
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
    </div>
  );
}
