"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth/current-user";
import { FFT_RANKS, fftLabel } from "@/lib/fft";
import { formatBirth, parseBirthDate } from "@/lib/players/birth";
import { type ImportRow } from "@/lib/players/import";
import { idSchema } from "@/lib/validation/team";
import { DomainError } from "@/server/errors";
import {
  type ImportAction,
  addClubPlayer,
  addClubPlayerToTeam,
  applyImport,
  deleteClubPlayer,
  parseImportFile,
  previewImport,
  updateClubPlayer,
} from "@/server/club-players";
import type { ImportState } from "./import-state";
import type { FormState } from "./types";

const get = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : undefined;
};

/** Champs d'une fiche : prénom, nom, classement, date de naissance facultative (jj/mm/aaaa ou aaaa-mm-jj). */
function readPlayer(fd: FormData) {
  const values = { firstName: get(fd, "firstName") ?? "", lastName: get(fd, "lastName") ?? "", fftRank: get(fd, "fftRank") ?? "", birthDate: get(fd, "birthDate") ?? "" };
  const rank = FFT_RANKS.find((r) => r.value === values.fftRank);
  if (!rank) return { values, error: { fftRank: "Choisis le classement" } as Record<string, string> };
  const b = parseBirthDate(values.birthDate);
  if ("error" in b) return { values, error: { birthDate: b.error } as Record<string, string> };
  return { values, input: { firstName: values.firstName, lastName: values.lastName, fftRank: rank.value, birthDate: b.date } };
}

async function run(fn: () => Promise<unknown>, ok: string, values?: Record<string, string>): Promise<FormState> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof DomainError) return { message: e.message, values };
    throw e;
  }
  refresh();
  return { message: ok, ok: true };
}

export async function addClubPlayerAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const clubId = idSchema.safeParse(get(fd, "clubId"));
  const r = readPlayer(fd);
  if (!clubId.success) return { message: "Requête invalide", values: r.values };
  if (!r.input) return { errors: r.error, values: r.values };
  return run(() => addClubPlayer(user.id, clubId.data, r.input), "Joueur ajouté.", r.values);
}

export async function updateClubPlayerAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = idSchema.safeParse(get(fd, "playerId"));
  const r = readPlayer(fd);
  if (!id.success) return { message: "Requête invalide", values: r.values };
  if (!r.input) return { errors: r.error, values: r.values };
  return run(() => updateClubPlayer(user.id, id.data, r.input), "Joueur enregistré.", r.values);
}

export async function deleteClubPlayerAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = idSchema.safeParse(get(fd, "playerId"));
  if (!id.success) return { message: "Requête invalide" };
  return run(() => deleteClubPlayer(user.id, id.data), "Joueur supprimé.");
}

export async function addPlayerToTeamAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const team = idSchema.safeParse(get(fd, "teamId"));
  const player = idSchema.safeParse(get(fd, "playerId"));
  if (!player.success) return { message: "Requête invalide" };
  if (!team.success) return { errors: { teamId: "Choisis une équipe" } };
  return run(() => addClubPlayerToTeam(user.id, team.data, player.data), "Joueur ajouté à l'équipe.");
}

// ─────────────────────────────── Import ───────────────────────────────

const SHOWN = 300;
const ORDER: Record<ImportAction, number> = { error: 0, update: 1, duplicate: 2, create: 3, same: 4 };

/**
 * Deux étapes avec le même fichier : « preview » (aperçu, rien n'est enregistré) puis « import » (le fichier est relu et les lignes valides
 * sont enregistrées ; le serveur ne fait pas confiance à l'aperçu). Champs : clubId, file, intent.
 */
export async function importPlayersAction(_: ImportState, fd: FormData): Promise<ImportState> {
  const user = await requireUser();
  const clubId = idSchema.safeParse(get(fd, "clubId"));
  const file = fd.get("file");
  const intent = get(fd, "intent");
  if (!clubId.success || (intent !== "preview" && intent !== "import")) return { fatal: "Requête invalide" };
  if (!(file instanceof File) || file.size === 0) return { fatal: "Choisis un fichier." };
  try {
    const parsed = await parseImportFile({ name: file.name, size: file.size, bytes: Buffer.from(await file.arrayBuffer()) });
    if (parsed.fatal) return { fatal: parsed.fatal };
    if (intent === "import") {
      const summary = await applyImport(user.id, clubId.data, parsed.rows as ImportRow[]);
      refresh();
      return { done: summary };
    }
    const plan = await previewImport(user.id, clubId.data, parsed.rows);
    const sorted = [...plan.rows].sort((a, b) => ORDER[a.action] - ORDER[b.action] || a.line - b.line);
    return {
      preview: {
        rows: sorted.slice(0, SHOWN).map((r) => ({
          line: r.line,
          name: `${r.firstName} ${r.lastName}`.trim(),
          birth: r.birthDate ? formatBirth(r.birthDate) : "",
          rank: r.errors.length > 0 ? "" : fftLabel(r.fftRank),
          action: r.action,
          details: [...r.errors, ...r.changes, ...r.notes],
        })),
        hidden: Math.max(0, sorted.length - SHOWN),
        summary: plan.summary,
      },
    };
  } catch (e) {
    if (e instanceof DomainError) return { fatal: e.message };
    throw e;
  }
}
