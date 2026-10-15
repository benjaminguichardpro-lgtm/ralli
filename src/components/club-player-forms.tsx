"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { addClubPlayerAction, addPlayerToTeamAction, deleteClubPlayerAction, importPlayersAction, updateClubPlayerAction } from "@/app/actions/club-players";
import { type ImportPreviewRow, initialImportState } from "@/app/actions/import-state";
import { initialFormState } from "@/app/actions/types";
import { FFT_RANKS } from "@/lib/fft";
import { Field, FormMessage, Select, SubmitButton, confirmOnSubmit } from "./ui";

// « Joueurs du club » (admins) : ajout et modification d'une fiche, placement dans une équipe, suppression, import en lot. Chaque action revérifie les droits côté serveur.

const rankOptions = FFT_RANKS.map((r) => ({ value: r.value, label: r.label }));

export type PlayerValues = { firstName: string; lastName: string; fftRank: string; birthDate: string };

function PlayerFields({ v, e }: { v: Partial<PlayerValues>; e: Record<string, string> }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Prénom" name="firstName" maxLength={40} defaultValue={v.firstName} error={e.firstName} />
        <Field label="Nom" name="lastName" maxLength={40} defaultValue={v.lastName} error={e.lastName} />
      </div>
      <Select label="Classement" name="fftRank" placeholder="Choisir le classement" defaultValue={v.fftRank ?? ""} options={rankOptions} error={e.fftRank} />
      <Field label="Date de naissance (facultative)" name="birthDate" type="date" defaultValue={v.birthDate} error={e.birthDate} hint="Visible des admins du club seulement." />
    </>
  );
}

export function AddClubPlayerForm({ clubId }: { clubId: string }) {
  const [state, action] = useActionState(addClubPlayerAction, initialFormState);
  return (
    <form key={JSON.stringify(state.values ?? {})} action={action} className="space-y-3" noValidate data-testid="add-club-player">
      <input type="hidden" name="clubId" value={clubId} />
      <PlayerFields v={state.values ?? {}} e={state.errors ?? {}} />
      <FormMessage signal={state} ok={state.ok}>{state.message}</FormMessage>
      <SubmitButton className="w-full" pendingLabel="Ajout…">
        Ajouter le joueur
      </SubmitButton>
    </form>
  );
}

export function EditClubPlayerForm({ playerId, initial }: { playerId: string; initial: PlayerValues }) {
  const [state, action] = useActionState(updateClubPlayerAction, initialFormState);
  const v = state.values ?? initial;
  return (
    <form key={JSON.stringify(state.values ?? {})} action={action} className="space-y-3" noValidate data-testid="edit-club-player">
      <input type="hidden" name="playerId" value={playerId} />
      <PlayerFields v={v} e={state.errors ?? {}} />
      <FormMessage signal={state} ok={state.ok}>{state.message}</FormMessage>
      <SubmitButton variant="ghost" pendingLabel="…">
        Enregistrer
      </SubmitButton>
    </form>
  );
}

export function AddToTeamForm({ playerId, teams }: { playerId: string; teams: { id: string; name: string }[] }) {
  const [state, action] = useActionState(addPlayerToTeamAction, initialFormState);
  if (teams.length === 0) return null;
  return (
    <form action={action} className="space-y-3" noValidate data-testid="add-to-team">
      <input type="hidden" name="playerId" value={playerId} />
      <Select label="Ajouter à une équipe" name="teamId" placeholder="Choisir une équipe" options={teams.map((t) => ({ value: t.id, label: t.name }))} error={state.errors?.teamId} />
      <FormMessage signal={state} ok={state.ok}>{state.message}</FormMessage>
      <SubmitButton variant="ghost" pendingLabel="…">
        Ajouter à l&apos;équipe
      </SubmitButton>
    </form>
  );
}

export function DeleteClubPlayerForm({ playerId, name }: { playerId: string; name: string }) {
  const [state, action] = useActionState(deleteClubPlayerAction, initialFormState);
  return (
    <form action={action} onSubmit={confirmOnSubmit(`Supprimer la fiche de ${name} ?`)} className="space-y-2">
      <input type="hidden" name="playerId" value={playerId} />
      <SubmitButton variant="ghost" pendingLabel="…">
        Supprimer la fiche
      </SubmitButton>
      <FormMessage signal={state} ok={state.ok}>{state.message}</FormMessage>
    </form>
  );
}

const ACTION_LABEL: Record<ImportPreviewRow["action"], string> = {
  create: "Nouveau",
  update: "Mise à jour",
  same: "Identique",
  duplicate: "Doublon",
  error: "Erreur",
};

/**
 * Import en lot : choisir un fichier (.xlsx ou .csv), « Vérifier le fichier » affiche un aperçu ligne par ligne (rien n'est enregistré),
 * puis « Importer » enregistre les lignes valides. Le fichier est gardé en mémoire entre les deux étapes et renvoyé au serveur, qui le relit.
 */
export function ImportPlayersPanel({ clubId }: { clubId: string }) {
  const [state, action, pending] = useActionState(importPlayersAction, initialImportState);
  const [file, setFile] = useState<File | null>(null);
  const [missing, setMissing] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const send = (intent: "preview" | "import") => {
    // Le fichier est relu dans le champ au moment du clic (et pas seulement dans l'état) : fiable même si le choix a précédé le chargement de la page.
    const chosen = input.current?.files?.[0] ?? file;
    if (!chosen) {
      setMissing(true);
      return;
    }
    setMissing(false);
    const fd = new FormData();
    fd.set("clubId", clubId);
    fd.set("intent", intent);
    fd.set("file", chosen);
    startTransition(() => action(fd));
  };
  const p = state.preview;
  const importable = p ? p.summary.create + p.summary.update : 0;

  return (
    <div className="space-y-4" data-testid="import-panel">
      <div className="space-y-2">
        <label htmlFor="import-file" className="block font-medium">
          Fichier à importer
        </label>
        <input
          id="import-file"
          ref={input}
          type="file"
          accept=".xlsx,.csv,.txt,.tsv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setMissing(false);
          }}
          className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-lg file:border file:border-primary file:bg-surface file:px-4 file:font-semibold file:text-primary"
          data-testid="import-file"
        />
        <p className="text-sm text-ink-muted">Excel (.xlsx) ou CSV, une ligne par joueur : Nom, Prénom, Date de naissance, Classement.</p>
      </div>

      {missing && (
        <p className="rounded-lg border-l-4 border-danger bg-surface p-3" role="alert" data-testid="import-missing">
          Choisis d&apos;abord un fichier.
        </p>
      )}
      {state.fatal && (
        <p className="rounded-lg border-l-4 border-danger bg-surface p-3" role="alert" data-testid="import-fatal">
          {state.fatal}
        </p>
      )}
      {state.message && <FormMessage signal={state}>{state.message}</FormMessage>}

      {state.done ? (
        <div className="space-y-1 rounded-lg border-l-4 border-primary bg-pale p-3" data-testid="import-done">
          <p className="font-semibold">Import terminé.</p>
          <p>
            {state.done.create} joueur{state.done.create > 1 ? "s" : ""} ajouté{state.done.create > 1 ? "s" : ""}, {state.done.update} mis à jour, {state.done.same} déjà à jour, {state.done.duplicate + state.done.error} ignoré
            {state.done.duplicate + state.done.error > 1 ? "s" : ""}.
          </p>
        </div>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => send("preview")}
          data-testid="import-preview"
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-primary bg-surface px-4 font-semibold text-primary transition-opacity disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {pending ? "Lecture du fichier…" : "Vérifier le fichier"}
        </button>
      )}

      {p && !state.done && (
        <div className="space-y-3" data-testid="import-preview-result">
          <p className="font-semibold" data-testid="import-summary">
            {p.summary.create} nouveau{p.summary.create > 1 ? "x" : ""} · {p.summary.update} mise{p.summary.update > 1 ? "s" : ""} à jour · {p.summary.same} identique{p.summary.same > 1 ? "s" : ""} · {p.summary.duplicate} doublon
            {p.summary.duplicate > 1 ? "s" : ""} · {p.summary.error} erreur{p.summary.error > 1 ? "s" : ""}
          </p>
          <div className="max-h-96 overflow-auto rounded-lg border border-line">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-pale">
                <tr>
                  <th className="px-2 py-2">Ligne</th>
                  <th className="px-2 py-2">Joueur</th>
                  <th className="px-2 py-2">Classement</th>
                  <th className="px-2 py-2">Résultat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {p.rows.map((r) => (
                  <tr key={r.line} data-action={r.action} data-testid="import-row">
                    <td className="px-2 py-2 text-ink-muted">{r.line}</td>
                    <td className="px-2 py-2">
                      {r.name}
                      {r.birth && <span className="block text-xs text-ink-muted">{r.birth}</span>}
                    </td>
                    <td className="px-2 py-2">{r.rank}</td>
                    <td className="px-2 py-2">
                      <span className={r.action === "error" ? "font-semibold text-danger" : "font-semibold"}>{ACTION_LABEL[r.action]}</span>
                      {r.details.map((d) => (
                        <span key={d} className="block text-xs text-ink-muted">
                          {d}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {p.hidden > 0 && <p className="text-sm text-ink-muted">… et {p.hidden} autre{p.hidden > 1 ? "s" : ""} ligne{p.hidden > 1 ? "s" : ""} identique{p.hidden > 1 ? "s" : ""} ou à créer (non affichée{p.hidden > 1 ? "s" : ""}).</p>}
          {p.summary.error > 0 && <p className="text-sm text-ink-muted">Les lignes en erreur ne seront pas importées : corrige-les dans ton fichier et recommence, ou importe les autres.</p>}
          <button
            type="button"
            disabled={importable === 0 || pending}
            onClick={() => {
              if (window.confirm(`Importer ${importable} joueur${importable > 1 ? "s" : ""} (${p.summary.create} ajouté${p.summary.create > 1 ? "s" : ""}, ${p.summary.update} mis à jour) ?`)) send("import");
            }}
            data-testid="import-confirm"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 font-semibold text-on-primary transition-opacity disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {pending ? "Import en cours…" : importable === 0 ? "Rien à importer" : `Importer ${importable} joueur${importable > 1 ? "s" : ""}`}
          </button>
        </div>
      )}
    </div>
  );
}
