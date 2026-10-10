"use client";

import { useActionState } from "react";
import {
  addMatchAction,
  cancelAction,
  createEncounterAction,
  deleteDraftAction,
  publishAction,
  removeMatchAction,
  replaceMatchAction,
  rescheduleAction,
} from "@/app/actions/encounters";
import { initialFormState } from "@/app/actions/types";
import { Field, FieldError, FormMessage, Select, SubmitButton, confirmOnSubmit } from "./ui";

type Option = { id: string; name: string };
type PlayerOption = { id: string; label: string };
const toOptions = (xs: PlayerOption[]) => xs.map((x) => ({ value: x.id, label: x.label }));

export function CreateEncounterForm({ clubTeams, opponents }: { clubTeams: Option[]; opponents: Option[] }) {
  const [state, action] = useActionState(createEncounterAction, initialFormState);
  const e = state.errors ?? {};
  const v = state.values ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage signal={state} ok={state.ok}>{state.message}</FormMessage>
      <Select
        label="Votre équipe"
        name="clubTeamId"
        defaultValue={v.clubTeamId ?? clubTeams[0]?.id}
        options={clubTeams.map((t) => ({ value: t.id, label: t.name }))}
        error={e.clubTeamId}
      />
      <Select
        label="Adversaire"
        name="opponentTeamId"
        placeholder="Choisir dans la liste du club"
        defaultValue={v.opponentTeamId ?? ""}
        options={opponents.map((t) => ({ value: t.id, label: t.name }))}
        error={e.opponentTeamId}
      />
      <fieldset className="space-y-1">
        <legend className="font-medium">Lieu</legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex min-h-11 items-center gap-2">
            <input type="radio" name="venue" value="home" defaultChecked={(v.venue ?? "home") === "home"} className="size-5 accent-primary" />
            Votre équipe reçoit (domicile)
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input type="radio" name="venue" value="away" defaultChecked={v.venue === "away"} className="size-5 accent-primary" />
            Votre équipe se déplace (extérieur)
          </label>
        </div>
        {e.venue && <FieldError>{e.venue}</FieldError>}
      </fieldset>
      <Field
        label="Date et heure de début"
        name="startsAt"
        type="datetime-local"
        defaultValue={v.startsAt}
        error={e.startsAt}
        hint="Heure de Paris. Les pronostics ferment à cette heure."
      />
      <SubmitButton className="w-full" pendingLabel="Création…">
        Créer le brouillon
      </SubmitButton>
    </form>
  );
}

export function AddMatchForm({
  encounterId,
  homeRoster,
  awayRoster,
  published,
}: {
  encounterId: string;
  homeRoster: PlayerOption[];
  awayRoster: PlayerOption[];
  published: boolean;
}) {
  const [state, action] = useActionState(addMatchAction, initialFormState);
  const e = state.errors ?? {};
  return (
    <form key={state.message} action={action} className="space-y-3" noValidate>
      <input type="hidden" name="encounterId" value={encounterId} />
      <Select label="Joueur domicile" name="homePlayerId" placeholder="Choisir" options={toOptions(homeRoster)} error={e.homePlayerId} />
      <Select label="Joueur extérieur" name="awayPlayerId" placeholder="Choisir" options={toOptions(awayRoster)} error={e.awayPlayerId} />
      {published && <p className="text-sm text-ink-muted">Rencontre publiée : les cotes de ce match seront calculées tout de suite.</p>}
      <SubmitButton pendingLabel="Ajout…">Ajouter le match</SubmitButton>
      <FormMessage signal={state} ok={state.ok}>{state.message}</FormMessage>
    </form>
  );
}

const POINTS_OPTIONS = [
  { value: "1", label: "1 point" },
  { value: "2", label: "2 points" },
];

/** Double : deux joueurs de l'équipe du club contre deux joueurs de l'équipe adverse, valant 1 ou 2 points. */
export function AddDoubleForm({
  encounterId,
  homeRoster,
  awayRoster,
  published,
}: {
  encounterId: string;
  homeRoster: PlayerOption[];
  awayRoster: PlayerOption[];
  published: boolean;
}) {
  const [state, action] = useActionState(addMatchAction, initialFormState);
  const e = state.errors ?? {};
  return (
    <form key={state.message} action={action} className="space-y-3" noValidate>
      <input type="hidden" name="encounterId" value={encounterId} />
      <Select label="Joueur domicile 1" name="homePlayerId" placeholder="Choisir" options={toOptions(homeRoster)} error={e.homePlayerId} />
      <Select label="Joueur domicile 2" name="homePlayer2Id" placeholder="Choisir" options={toOptions(homeRoster)} error={e.homePlayer2Id} />
      <Select label="Joueur extérieur 1" name="awayPlayerId" placeholder="Choisir" options={toOptions(awayRoster)} error={e.awayPlayerId} />
      <Select label="Joueur extérieur 2" name="awayPlayer2Id" placeholder="Choisir" options={toOptions(awayRoster)} error={e.awayPlayer2Id} />
      <Select label="Valeur du double" name="points" defaultValue="1" options={POINTS_OPTIONS} error={e.points} />
      {published && <p className="text-sm text-ink-muted">Rencontre publiée : les cotes de ce double seront calculées tout de suite.</p>}
      <SubmitButton pendingLabel="Ajout…">Ajouter le double</SubmitButton>
      <FormMessage signal={state} ok={state.ok}>{state.message}</FormMessage>
    </form>
  );
}

export function EditMatchForm({
  match,
  homeRoster,
  awayRoster,
  published,
}: {
  match: {
    id: string;
    kind: "SINGLES" | "DOUBLES";
    points: number;
    homePlayerId: string;
    awayPlayerId: string;
    homePlayer2Id: string | null;
    awayPlayer2Id: string | null;
    homeFull: string;
    awayFull: string;
  };
  homeRoster: PlayerOption[];
  awayRoster: PlayerOption[];
  published: boolean;
}) {
  const [editState, editAction] = useActionState(replaceMatchAction, initialFormState);
  const [removeState, removeAction] = useActionState(removeMatchAction, initialFormState);
  const label = `${match.homeFull} contre ${match.awayFull}`;
  const refundWarning = published ? " Les pronostics déjà faits sur ce match seront remboursés." : "";
  return (
    <div className="space-y-3 pt-2">
      <form action={editAction} onSubmit={published ? confirmOnSubmit(`Modifier le match ${label} ?${refundWarning}`) : undefined} className="space-y-3">
        <input type="hidden" name="matchId" value={match.id} />
        {match.kind === "DOUBLES" ? (
          <>
            <Select label="Joueur domicile 1" name="homePlayerId" defaultValue={match.homePlayerId} options={toOptions(homeRoster)} />
            <Select label="Joueur domicile 2" name="homePlayer2Id" defaultValue={match.homePlayer2Id ?? ""} options={toOptions(homeRoster)} />
            <Select label="Joueur extérieur 1" name="awayPlayerId" defaultValue={match.awayPlayerId} options={toOptions(awayRoster)} />
            <Select label="Joueur extérieur 2" name="awayPlayer2Id" defaultValue={match.awayPlayer2Id ?? ""} options={toOptions(awayRoster)} />
            <Select label="Valeur du double" name="points" defaultValue={String(match.points)} options={POINTS_OPTIONS} />
          </>
        ) : (
          <>
            <Select label="Joueur domicile" name="homePlayerId" defaultValue={match.homePlayerId} options={toOptions(homeRoster)} />
            <Select label="Joueur extérieur" name="awayPlayerId" defaultValue={match.awayPlayerId} options={toOptions(awayRoster)} />
          </>
        )}
        <SubmitButton variant="ghost">Enregistrer le match</SubmitButton>
        <FormMessage signal={editState} ok={editState.ok}>{editState.message}</FormMessage>
      </form>
      <form action={removeAction} onSubmit={confirmOnSubmit(`Retirer le match ${label} ?${refundWarning}`)}>
        <input type="hidden" name="matchId" value={match.id} />
        <SubmitButton variant="ghost" aria-label={`Retirer le match ${label}`}>
          Retirer ce match
        </SubmitButton>
        <FormMessage signal={removeState} ok={removeState.ok}>{removeState.message}</FormMessage>
      </form>
    </div>
  );
}

export function PublishForm({ encounterId }: { encounterId: string }) {
  const [state, action] = useActionState(publishAction, initialFormState);
  return (
    <form
      action={action}
      onSubmit={confirmOnSubmit("Publier la rencontre ? Les cotes seront calculées et figées, et les pronostics ouverts.")}
      className="space-y-2"
    >
      <input type="hidden" name="encounterId" value={encounterId} />
      <SubmitButton className="w-full" pendingLabel="Publication…">
        Publier la rencontre
      </SubmitButton>
      <FormMessage signal={state} ok={state.ok}>{state.message}</FormMessage>
    </form>
  );
}

export function RescheduleForm({ encounterId, currentLocal, locked }: { encounterId: string; currentLocal: string; locked: boolean }) {
  const [state, action] = useActionState(rescheduleAction, initialFormState);
  return (
    <form action={action} className="space-y-3" noValidate>
      <input type="hidden" name="encounterId" value={encounterId} />
      <Field
        label="Nouvelle date et heure"
        name="startsAt"
        type="datetime-local"
        defaultValue={currentLocal}
        error={state.errors?.startsAt}
        hint={
          locked
            ? "La rencontre a commencé : les pronostics restent fermés après le report."
            : "Heure de Paris. Les pronostics fermeront à la nouvelle heure ; ceux déjà faits sont conservés."
        }
      />
      <SubmitButton variant="ghost">Reporter</SubmitButton>
      <FormMessage signal={state} ok={state.ok}>{state.message}</FormMessage>
    </form>
  );
}

export function CancelForm({ encounterId }: { encounterId: string }) {
  const [state, action] = useActionState(cancelAction, initialFormState);
  return (
    <form
      action={action}
      onSubmit={confirmOnSubmit("Annuler la rencontre ? Tous les pronostics en cours seront remboursés. C'est définitif.")}
      className="space-y-3"
      noValidate
    >
      <input type="hidden" name="encounterId" value={encounterId} />
      <Field label="Motif (facultatif)" name="reason" placeholder="Pluie, forfait…" error={state.errors?.reason} />
      <SubmitButton variant="secondary">Annuler la rencontre</SubmitButton>
      <FormMessage signal={state} ok={state.ok}>{state.message}</FormMessage>
    </form>
  );
}

export function DeleteDraftForm({ encounterId }: { encounterId: string }) {
  const [state, action] = useActionState(deleteDraftAction, initialFormState);
  return (
    <form action={action} onSubmit={confirmOnSubmit("Supprimer définitivement ce brouillon ?")} className="space-y-2">
      <input type="hidden" name="encounterId" value={encounterId} />
      <SubmitButton variant="ghost">Supprimer le brouillon</SubmitButton>
      <FormMessage signal={state} ok={state.ok}>{state.message}</FormMessage>
    </form>
  );
}
