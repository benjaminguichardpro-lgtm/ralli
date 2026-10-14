"use client";

import { useActionState } from "react";
import {
  addEntryAction,
  addNewEntryAction,
  cancelTournamentAction,
  createTournamentAction,
  deleteDraftTournamentAction,
  publishTournamentAction,
  recordTournamentResultAction,
  removeEntryAction,
  setFirstRoundAction,
  setMatchTimeAction,
} from "@/app/actions/tournaments";
import { initialFormState } from "@/app/actions/types";
import { FFT_RANKS } from "@/lib/fft";
import { DRAW_SIZES } from "@/lib/tournaments/bracket";
import { OUTCOME_LABELS } from "@/lib/scores/result";
import { Field, FormMessage, Select, SubmitButton, confirmOnSubmit } from "./ui";

// Formulaires des tournois (admins du club). Chaque action revérifie les droits côté serveur.

export function CreateTournamentForm({ clubId }: { clubId: string }) {
  const [state, action] = useActionState(createTournamentAction, initialFormState);
  const e = state.errors ?? {};
  const v = state.values ?? {};
  return (
    <form action={action} className="space-y-4" noValidate data-testid="create-tournament">
      <input type="hidden" name="clubId" value={clubId} />
      <FormMessage signal={state} ok={state.ok}>{state.message}</FormMessage>
      <Field label="Nom du tournoi" name="name" maxLength={60} defaultValue={v.name} error={e.name} placeholder="Tournoi d'automne" />
      <Select label="Taille du tableau" name="drawSize" defaultValue={v.drawSize ?? "8"} options={DRAW_SIZES.map((n) => ({ value: String(n), label: `${n} joueurs` }))} />
      <Field label="Date de début du tournoi" name="startsAt" type="datetime-local" defaultValue={v.startsAt} error={e.startsAt} hint="Heure de Paris. Chaque match aura ensuite sa propre heure." />
      <SubmitButton className="w-full" pendingLabel="Création…">
        Créer le tournoi
      </SubmitButton>
    </form>
  );
}

export function AddEntryForm({ tournamentId, players }: { tournamentId: string; players: { id: string; name: string; rank: string }[] }) {
  const [state, action] = useActionState(addEntryAction, initialFormState);
  if (players.length === 0) return <p className="text-sm text-ink-muted">Toutes les fiches du club sont inscrites (ou le club n&apos;a pas encore de joueur).</p>;
  return (
    <form action={action} className="space-y-3" noValidate data-testid="add-entry">
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <Select label="Joueur du club" name="playerId" placeholder="Choisir une fiche" options={players.map((p) => ({ value: p.id, label: `${p.name} (${p.rank})` }))} error={state.errors?.playerId} />
      <FormMessage signal={state} ok={state.ok}>{state.message}</FormMessage>
      <SubmitButton variant="ghost" pendingLabel="…">
        Inscrire ce joueur
      </SubmitButton>
    </form>
  );
}

export function AddNewEntryForm({ tournamentId }: { tournamentId: string }) {
  const [state, action] = useActionState(addNewEntryAction, initialFormState);
  const v = state.values ?? {};
  return (
    <form key={JSON.stringify(state.values ?? {})} action={action} className="space-y-3" noValidate data-testid="add-new-entry">
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Prénom" name="firstName" maxLength={40} defaultValue={v.firstName} />
        <Field label="Nom" name="lastName" maxLength={40} defaultValue={v.lastName} />
      </div>
      <Select label="Niveau FFT" name="fftRank" placeholder="Choisir le niveau" defaultValue={v.fftRank ?? ""} options={FFT_RANKS.map((r) => ({ value: r.value, label: r.label }))} error={state.errors?.fftRank} />
      <FormMessage signal={state} ok={state.ok}>{state.message}</FormMessage>
      <SubmitButton variant="ghost" pendingLabel="…">
        Ajouter et inscrire
      </SubmitButton>
    </form>
  );
}

export function RemoveEntryForm({ tournamentId, playerId, name }: { tournamentId: string; playerId: string; name: string }) {
  const [state, action] = useActionState(removeEntryAction, initialFormState);
  return (
    <form action={action} onSubmit={confirmOnSubmit(`Retirer ${name} du tournoi ?`)} className="inline">
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <input type="hidden" name="playerId" value={playerId} />
      <SubmitButton variant="ghost" pendingLabel="…" aria-label={`Retirer ${name}`}>
        Retirer
      </SubmitButton>
      {state.message && !state.ok && <FormMessage signal={state}>{state.message}</FormMessage>}
    </form>
  );
}

type Entry = { playerId: string; fullName: string; rank: string };
export type FirstRoundSlot = { position: number; homePlayerId: string | null; awayPlayerId: string | null; startsAtInput: string };

/** Tableau du premier tour, saisi à la main : pour chaque match, les deux joueurs inscrits et l'heure de début. */
export function FirstRoundForm({ tournamentId, entries, slots }: { tournamentId: string; entries: Entry[]; slots: FirstRoundSlot[] }) {
  const [state, action] = useActionState(setFirstRoundAction, initialFormState);
  const v = state.values;
  const options = entries.map((p) => ({ value: p.playerId, label: `${p.fullName} (${p.rank})` }));
  return (
    <form key={JSON.stringify(state.values ?? {})} action={action} className="space-y-4" noValidate data-testid="first-round-form">
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <input type="hidden" name="slots" value={slots.length} />
      {slots.map((s) => (
        <fieldset key={s.position} className="space-y-3 border-t border-line pt-3">
          <legend className="font-semibold text-primary">Match {s.position + 1}</legend>
          <Select label={`Match ${s.position + 1} · joueur domicile`} name={`home_${s.position}`} placeholder="—" defaultValue={v?.[`home_${s.position}`] ?? s.homePlayerId ?? ""} options={options} />
          <Select label={`Match ${s.position + 1} · joueur extérieur`} name={`away_${s.position}`} placeholder="—" defaultValue={v?.[`away_${s.position}`] ?? s.awayPlayerId ?? ""} options={options} />
          <Field label={`Match ${s.position + 1} · heure de début`} name={`time_${s.position}`} type="datetime-local" defaultValue={v?.[`time_${s.position}`] ?? s.startsAtInput} hint="Heure de Paris. Les pronostics ferment à cette heure." />
        </fieldset>
      ))}
      <FormMessage signal={state} ok={state.ok}>{state.message}</FormMessage>
      <SubmitButton className="w-full" pendingLabel="Enregistrement…">
        Enregistrer le tableau
      </SubmitButton>
    </form>
  );
}

export function PublishTournamentForm({ tournamentId }: { tournamentId: string }) {
  const [state, action] = useActionState(publishTournamentAction, initialFormState);
  return (
    <form action={action} onSubmit={confirmOnSubmit("Publier le tournoi ? Le tableau et les cotes seront visibles de tous et les pronostics s'ouvriront. Le tableau ne pourra plus être modifié.")} className="space-y-2">
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <SubmitButton className="w-full" pendingLabel="Publication…" data-testid="publish-tournament">
        Publier le tournoi
      </SubmitButton>
      <FormMessage signal={state} ok={state.ok}>{state.message}</FormMessage>
    </form>
  );
}

export function DeleteDraftTournamentForm({ tournamentId, clubId }: { tournamentId: string; clubId: string }) {
  const [state, action] = useActionState(deleteDraftTournamentAction, initialFormState);
  return (
    <form action={action} onSubmit={confirmOnSubmit("Supprimer ce brouillon de tournoi ?")} className="space-y-2">
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <input type="hidden" name="clubId" value={clubId} />
      <SubmitButton variant="ghost" pendingLabel="…">
        Supprimer le brouillon
      </SubmitButton>
      <FormMessage signal={state} ok={state.ok}>{state.message}</FormMessage>
    </form>
  );
}

export function CancelTournamentForm({ tournamentId }: { tournamentId: string }) {
  const [state, action] = useActionState(cancelTournamentAction, initialFormState);
  return (
    <form action={action} onSubmit={confirmOnSubmit("Annuler le tournoi ? Tous les pronostics en cours seront remboursés. C'est définitif.")} className="space-y-2">
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <SubmitButton variant="ghost" pendingLabel="…" data-testid="cancel-tournament">
        Annuler le tournoi
      </SubmitButton>
      <FormMessage signal={state} ok={state.ok}>{state.message}</FormMessage>
    </form>
  );
}

/** Heure de début d'un match (admins) : à fixer, ou à changer tant que le match n'a pas commencé. */
export function MatchTimeForm({ matchId, current }: { matchId: string; current: string }) {
  const [state, action] = useActionState(setMatchTimeAction, initialFormState);
  return (
    <form action={action} className="space-y-2" noValidate data-testid="match-time-form">
      <input type="hidden" name="matchId" value={matchId} />
      <Field label={current ? "Changer l'heure de début" : "Heure de début"} name="startsAt" type="datetime-local" defaultValue={state.values?.startsAt ?? current} error={state.errors?.startsAt} hint="Heure de Paris. Les pronostics ferment à cette heure." />
      <FormMessage signal={state} ok={state.ok}>{state.message}</FormMessage>
      <SubmitButton variant="ghost" pendingLabel="…">
        Enregistrer l&apos;heure
      </SubmitButton>
    </form>
  );
}

const resultOutcomes = Object.entries(OUTCOME_LABELS)
  .filter(([k]) => k !== "NOT_PLAYED")
  .map(([value, label]) => ({ value, label }));

/** Résultat d'un match de tournoi (admins) : définitif, il règle tout de suite les pronostics et fait avancer le vainqueur. */
export function TournamentResultForm({ matchId, home, away }: { matchId: string; home: string; away: string }) {
  const [state, action] = useActionState(recordTournamentResultAction, initialFormState);
  const v = state.values ?? {};
  return (
    <form
      key={JSON.stringify(state.values ?? {})}
      action={action}
      onSubmit={confirmOnSubmit("Enregistrer ce résultat ? C'est définitif : les pronostics du match sont réglés tout de suite et le vainqueur passe au tour suivant.")}
      className="space-y-3"
      noValidate
      data-testid="tournament-result-form"
    >
      <input type="hidden" name="matchId" value={matchId} />
      <Select label="Issue du match" name="outcome" defaultValue={v.outcome ?? "COMPLETED"} options={resultOutcomes} />
      <Select
        label="Vainqueur"
        name="winner"
        placeholder="Choisir le vainqueur"
        defaultValue={v.winner ?? ""}
        options={[
          { value: "HOME", label: home },
          { value: "AWAY", label: away },
        ]}
        error={state.errors?.winner}
      />
      <Field label="Sets (facultatif)" name="sets" defaultValue={v.sets ?? ""} placeholder="6-4 3-6 10-8" hint="Score du domicile en premier, séparé par des espaces." />
      <FormMessage signal={state} ok={state.ok}>{state.message}</FormMessage>
      <SubmitButton className="w-full" pendingLabel="Enregistrement…">
        Enregistrer le résultat
      </SubmitButton>
    </form>
  );
}
