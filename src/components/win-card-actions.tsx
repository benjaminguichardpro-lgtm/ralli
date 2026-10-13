"use client";

import { useActionState, useState } from "react";
import { reportStoryAction, toggleReactionAction } from "@/app/actions/win-cards";
import { initialFormState } from "@/app/actions/types";
import { REPORT_REASON_MAX, WIN_REACTION, whatsappText } from "@/lib/win-cards";
import type { StoryData } from "./stories-bar";
import { WhatsAppShare } from "./share-link";
import { confirmOnSubmit } from "./ui";

/**
 * Sous une carte de ralli gagnant, dans le lecteur : réaction 🎾 (une par membre, retirable, pas sur sa propre carte),
 * signalement (aux admins du club, un par membre), et pour l'auteur le bouton WhatsApp. Le nombre de réactions se voit
 * partout ; les noms seulement chez l'auteur et les admins.
 */
export function WinCardActions({ story }: { story: StoryData }) {
  const [reactState, reactAction] = useActionState(toggleReactionAction, initialFormState);
  const [reportState, reportAction] = useActionState(reportStoryAction, initialFormState);
  const [reporting, setReporting] = useState(false);
  const { reactions, winCard } = story;
  const reported = story.reportedByMe || reportState.ok;
  return (
    <div className="space-y-3 border-t border-on-primary-soft/30 px-4 py-3" data-testid="win-actions">
      <div className="flex flex-wrap items-center gap-3">
        <form action={reactAction}>
          <input type="hidden" name="storyId" value={story.id} />
          <button
            type="submit"
            disabled={!story.canReact}
            aria-pressed={reactions.mine}
            aria-label={story.canReact ? `${reactions.mine ? "Retirer ma réaction" : "Réagir"} ${WIN_REACTION}, ${reactions.count} réaction${reactions.count > 1 ? "s" : ""}` : `${reactions.count} réaction${reactions.count > 1 ? "s" : ""} ${WIN_REACTION}`}
            data-testid="win-react"
            className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold disabled:opacity-100 ${reactions.mine ? "border-gold bg-gold text-on-gold" : "border-on-primary-soft"}`}
          >
            <span aria-hidden="true">{WIN_REACTION}</span>
            <span data-testid="win-react-count">{reactions.count}</span>
          </button>
        </form>
        {story.isMine && winCard && <WhatsAppShare text={whatsappText(winCard.payoutAces, winCard.matchLabel)} path={`/rencontres/${winCard.encounterId}`} label="Partager sur WhatsApp" className="border-on-primary-soft bg-transparent text-on-primary" />}
        {story.canReact && !reported && !reporting && (
          <button type="button" onClick={() => setReporting(true)} data-testid="win-report-open" className="min-h-11 px-2 text-sm underline">
            Signaler
          </button>
        )}
        {story.canReact && reported && (
          <p className="text-sm text-on-primary-soft" data-testid="win-reported">
            Signalée aux admins
          </p>
        )}
      </div>
      {reactions.names && reactions.names.length > 0 && (
        <p className="text-sm text-on-primary-soft" data-testid="win-react-names">
          {WIN_REACTION} {reactions.names.join(", ")}
        </p>
      )}
      {story.canReact && reporting && !reported && (
        <form action={reportAction} onSubmit={confirmOnSubmit("Signaler cette carte aux admins du club ?")} className="space-y-2" data-testid="win-report-form">
          <input type="hidden" name="storyId" value={story.id} />
          <label htmlFor={`report-${story.id}`} className="block text-sm font-medium">
            Pourquoi ? (facultatif)
          </label>
          <input id={`report-${story.id}`} name="reason" maxLength={REPORT_REASON_MAX} autoComplete="off" className="block min-h-11 w-full rounded-lg border border-on-primary-soft bg-surface px-3 text-ink" />
          <div className="flex gap-3">
            <button type="button" onClick={() => setReporting(false)} className="min-h-11 rounded-lg border border-on-primary-soft px-4 text-sm font-semibold">
              Annuler
            </button>
            <button type="submit" className="min-h-11 rounded-lg bg-gold px-4 text-sm font-semibold text-on-gold">
              Envoyer le signalement
            </button>
          </div>
        </form>
      )}
      {reactState.message && !reactState.ok && <p role="alert" className="text-sm font-semibold">⚠ {reactState.message}</p>}
      {reportState.message && !reportState.ok && <p role="alert" className="text-sm font-semibold">⚠ {reportState.message}</p>}
    </div>
  );
}
