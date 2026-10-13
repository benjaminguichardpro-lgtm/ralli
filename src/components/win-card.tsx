import { Avatar } from "./avatar";
import type { AvatarRef } from "@/lib/avatars";
import { winCardSummary } from "@/lib/win-cards";
import type { WinCardData } from "@/server/win-cards";

const aces = (n: number) => n.toLocaleString("fr-FR");

/**
 * Carte d'un ralli gagnant : l'auteur, le match, son ralli, la cote et les Aces engagés puis gagnés. Dessinée à partir des
 * chiffres du ralli, jamais saisie à la main. Elle s'affiche sur un fond vert Ralli (les couleurs viennent du thème).
 * `comment` est le mot de l'auteur (facultatif, 140 caractères).
 */
export function WinCard({ card, author, comment = "", className = "" }: { card: WinCardData; author: { name: string; avatar: AvatarRef }; comment?: string; className?: string }) {
  return (
    <div
      className={`grid gap-4 rounded-2xl bg-brand p-5 text-on-primary ${className}`}
      data-testid="win-card"
      role="group"
      aria-label={winCardSummary({ author: author.name, ...card })}
    >
      <div className="flex items-center gap-3">
        <Avatar user={author.avatar} size={44} />
        <p className="min-w-0 truncate font-semibold" data-testid="win-card-author">
          {author.name}
        </p>
        <span className="ml-auto shrink-0 rounded-full bg-gold px-3 py-1 text-xs font-bold uppercase tracking-wide text-on-gold">Ralli gagnant</span>
      </div>
      <div aria-hidden="true" className="grid gap-1">
        <p className="font-serif text-2xl font-semibold leading-tight" data-testid="win-card-match">
          {card.matchLabel}
        </p>
        <p className="text-sm text-on-primary-soft">
          Ralli sur <strong className="text-on-primary">{card.pickedName}</strong> · cote {card.odds}
        </p>
      </div>
      <div aria-hidden="true" className="grid grid-cols-2 gap-3 text-center">
        <div className="rounded-xl bg-primary-dark p-3">
          <p className="text-xs text-on-primary-soft">Aces engagés</p>
          <p className="font-figures text-2xl font-bold">{aces(card.committedAces)}</p>
        </div>
        <div className="rounded-xl bg-primary-dark p-3">
          <p className="text-xs text-on-primary-soft">Aces gagnés</p>
          <p className="font-figures text-2xl font-bold text-gold" data-testid="win-card-payout">
            {aces(card.payoutAces)}
          </p>
        </div>
      </div>
      <p aria-hidden="true" className="truncate text-sm text-on-primary-soft">
        {card.encounterTitle}
      </p>
      {comment && (
        <p className="whitespace-pre-wrap break-words border-t border-on-primary-soft/30 pt-3 font-serif text-xl italic" data-testid="win-card-comment">
          « {comment} »
        </p>
      )}
    </div>
  );
}
