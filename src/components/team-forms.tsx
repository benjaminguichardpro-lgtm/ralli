"use client";

import { useActionState } from "react";
import {
  addExistingPlayerAction,
  addNewPlayerAction,
  createExternalTeamAction,
  createTeamAction,
  deletePlayerAction,
  removePlayerAction,
  setCaptainAction,
  setPlayerAccountAction,
  updatePlayerAction,
} from "@/app/actions/teams";
import { initialFormState } from "@/app/actions/types";
import type { FftRank } from "@/generated/prisma/enums";
import { FFT_RANKS } from "@/lib/fft";
import { Field, FormMessage, Select, SubmitButton, confirmOnSubmit } from "./ui";

type Member = { userId: string; displayName: string };
const rankOptions = FFT_RANKS.map((r) => ({ value: r.value, label: r.label }));

export function CreateTeamForm({ clubId, members }: { clubId: string; members: Member[] }) {
  const [state, action] = useActionState(createTeamAction, initialFormState);
  return (
    <form action={action} className="space-y-3" noValidate>
      <input type="hidden" name="clubId" value={clubId} />
      <Field label="Nom de l'équipe" name="name" placeholder="Messieurs 1" defaultValue={state.values?.name} error={state.errors?.name} />
      <Select
        label="Capitaine"
        name="captainUserId"
        placeholder="Choisir un membre"
        defaultValue={state.values?.captainUserId ?? ""}
        options={members.map((m) => ({ value: m.userId, label: m.displayName }))}
        error={state.errors?.captainUserId}
      />
      <SubmitButton pendingLabel="Création…">Créer l&apos;équipe</SubmitButton>
    </form>
  );
}

export function CreateExternalTeamForm({ clubId }: { clubId: string }) {
  const [state, action] = useActionState(createExternalTeamAction, initialFormState);
  return (
    <form action={action} className="space-y-3" noValidate>
      <input type="hidden" name="clubId" value={clubId} />
      <Field
        label="Club adverse"
        name="externalClubName"
        placeholder="TC Voisin"
        defaultValue={state.values?.externalClubName}
        error={state.errors?.externalClubName}
      />
      <Field
        label="Nom de l'équipe adverse"
        name="name"
        placeholder="TC Voisin – Messieurs 1"
        defaultValue={state.values?.name}
        error={state.errors?.name}
        hint="Doit être différent des noms de vos équipes."
      />
      <SubmitButton variant="ghost" pendingLabel="Création…">
        Ajouter l&apos;équipe adverse
      </SubmitButton>
    </form>
  );
}

export function CaptainForm({ teamId, captainUserId, members }: { teamId: string; captainUserId?: string; members: Member[] }) {
  const [state, action] = useActionState(setCaptainAction, initialFormState);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="teamId" value={teamId} />
      <Select
        label="Capitaine"
        name="captainUserId"
        defaultValue={captainUserId ?? ""}
        options={members.map((m) => ({ value: m.userId, label: m.displayName }))}
      />
      <SubmitButton variant="ghost">Changer de capitaine</SubmitButton>
      <FormMessage>{state.message}</FormMessage>
    </form>
  );
}

export function AddPlayerForm({ teamId }: { teamId: string }) {
  const [state, action] = useActionState(addNewPlayerAction, initialFormState);
  const e = state.errors ?? {};
  // La clé force la remise à zéro des champs après un ajout réussi.
  return (
    <form key={state.values ? "keep" : state.message} action={action} className="space-y-3" noValidate>
      <input type="hidden" name="teamId" value={teamId} />
      <Field label="Prénom" name="firstName" autoComplete="off" defaultValue={state.values?.firstName} error={e.firstName} />
      <Field label="Nom" name="lastName" autoComplete="off" defaultValue={state.values?.lastName} error={e.lastName} />
      <Select
        label="Niveau FFT"
        name="fftRank"
        placeholder="Choisir"
        defaultValue={state.values?.fftRank ?? ""}
        options={rankOptions}
        error={e.fftRank}
      />
      <SubmitButton pendingLabel="Ajout…">Ajouter le joueur</SubmitButton>
      <FormMessage>{state.message}</FormMessage>
    </form>
  );
}

export function AddExistingPlayerForm({
  teamId,
  players,
}: {
  teamId: string;
  players: { id: string; firstName: string; lastName: string; rankLabel: string }[];
}) {
  const [state, action] = useActionState(addExistingPlayerAction, initialFormState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="teamId" value={teamId} />
      <Select
        label="Joueur d'une autre équipe du club"
        name="playerId"
        placeholder="Choisir"
        options={players.map((p) => ({ value: p.id, label: `${p.firstName} ${p.lastName} (${p.rankLabel})` }))}
      />
      <SubmitButton variant="ghost">Ajouter à l&apos;équipe</SubmitButton>
      <FormMessage>{state.message}</FormMessage>
    </form>
  );
}

type PlayerRow = {
  id: string;
  firstName: string;
  lastName: string;
  fftRank: FftRank;
  account: { userId: string; displayName: string } | null;
  hasMatches: boolean;
};

export function ManagePlayer({
  teamId,
  player,
  members,
  canLinkAccount,
}: {
  teamId: string;
  player: PlayerRow;
  members: Member[];
  canLinkAccount: boolean;
}) {
  const [editState, editAction] = useActionState(updatePlayerAction, initialFormState);
  const [linkState, linkAction] = useActionState(setPlayerAccountAction, initialFormState);
  const [removeState, removeAction] = useActionState(removePlayerAction, initialFormState);
  const [deleteState, deleteAction] = useActionState(deletePlayerAction, initialFormState);
  const fullName = `${player.firstName} ${player.lastName}`;
  const e = editState.errors ?? {};

  return (
    <div className="space-y-5 pt-3">
      <form action={editAction} className="space-y-3" noValidate>
        <input type="hidden" name="playerId" value={player.id} />
        <Field label="Prénom" name="firstName" defaultValue={editState.values?.firstName ?? player.firstName} error={e.firstName} />
        <Field label="Nom" name="lastName" defaultValue={editState.values?.lastName ?? player.lastName} error={e.lastName} />
        <Select label="Niveau FFT" name="fftRank" defaultValue={editState.values?.fftRank ?? player.fftRank} options={rankOptions} />
        <SubmitButton variant="ghost">Enregistrer la fiche</SubmitButton>
        <FormMessage>{editState.message}</FormMessage>
      </form>

      {canLinkAccount && (
        <form action={linkAction} className="space-y-3">
          <input type="hidden" name="playerId" value={player.id} />
          <Select
            label="Compte Ralli de ce joueur"
            name="userId"
            placeholder="Aucun compte"
            defaultValue={player.account?.userId ?? ""}
            options={members.map((m) => ({ value: m.userId, label: m.displayName }))}
          />
          <SubmitButton variant="ghost">Enregistrer le lien</SubmitButton>
          <FormMessage>{linkState.message}</FormMessage>
        </form>
      )}

      <div className="flex flex-wrap gap-3">
        <form action={removeAction} onSubmit={confirmOnSubmit(`Retirer ${fullName} de cette équipe ?`)}>
          <input type="hidden" name="teamId" value={teamId} />
          <input type="hidden" name="playerId" value={player.id} />
          <SubmitButton variant="ghost" aria-label={`Retirer ${fullName} de l'équipe`}>
            Retirer de l&apos;équipe
          </SubmitButton>
        </form>
        {!player.hasMatches && (
          <form
            action={deleteAction}
            onSubmit={confirmOnSubmit(`Supprimer définitivement la fiche de ${fullName} ? Elle sera retirée de toutes les équipes.`)}
          >
            <input type="hidden" name="playerId" value={player.id} />
            <SubmitButton variant="ghost" aria-label={`Supprimer la fiche de ${fullName}`}>
              Supprimer la fiche
            </SubmitButton>
          </form>
        )}
      </div>
      <FormMessage>{removeState.message ?? deleteState.message}</FormMessage>
    </div>
  );
}
