import { readSheet } from "read-excel-file/node";
import type { FftRank, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { fftLabel } from "@/lib/fft";
import { ageFrom } from "@/lib/players/birth";
import { parseCsv } from "@/lib/players/csv";
import { type ImportRow, MAX_IMPORT_BYTES, type ParsedImport, normalizeSheet } from "@/lib/players/import";
import { type PlayerInput, playerInputSchema } from "@/lib/validation/team";
import { DomainError } from "./errors";
import { CLUB_NOT_FOUND, requireClubAdmin } from "./permissions";
import { addExistingPlayerToTeam } from "./teams";

// « Joueurs du club » : liste, ajout, modification et suppression de fiches, et import en lot (CSV ou Excel). Réservé aux admins du club.
// La date de naissance n'est lue ni écrite ailleurs : jamais sur les pages d'équipe, les rencontres, les tournois ni les pages publiques.

export type ClubPlayerRow = {
  id: string;
  firstName: string;
  lastName: string;
  fftRank: FftRank;
  rankLabel: string;
  birthDate: Date | null;
  age: number | null;
  teams: { id: string; name: string }[];
  account: string | null;
  /** Fiche supprimable : jamais alignée dans un match et pas inscrite à un tournoi. */
  deletable: boolean;
};

/** Joueurs « du club » : ceux d'une équipe du club et ceux sans équipe (importés, ou inscrits à un tournoi). Les joueurs des équipes adverses et ceux d'autres clubs saisis pour un tournoi n'y sont pas. */
const clubPlayerFilter = (clubId: string): Prisma.PlayerWhereInput => ({
  clubId,
  externalClubName: null, // un joueur d'un autre club, saisi pour un tournoi, n'est pas un joueur du club
  OR: [{ teams: { none: {} } }, { teams: { some: { team: { kind: "CLUB" } } } }],
});

async function requireLiveClubAdmin(actorId: string, clubId: string) {
  await requireClubAdmin(actorId, clubId);
  if ((await db.club.count({ where: { id: clubId, deletedAt: null } })) === 0) throw CLUB_NOT_FOUND;
}

export async function listClubPlayers(actorId: string, clubId: string, now = new Date()): Promise<ClubPlayerRow[]> {
  await requireLiveClubAdmin(actorId, clubId);
  const rows = await db.player.findMany({
    where: clubPlayerFilter(clubId),
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      fftRank: true,
      birthDate: true,
      user: { select: { displayName: true } },
      teams: { where: { team: { kind: "CLUB" } }, select: { team: { select: { id: true, name: true } } } },
      _count: { select: { homeMatches: true, awayMatches: true, homeMatches2: true, awayMatches2: true, tournamentEntries: true, tournamentHome: true, tournamentAway: true } },
    },
  });
  return rows.map((p) => ({
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    fftRank: p.fftRank,
    rankLabel: fftLabel(p.fftRank),
    birthDate: p.birthDate,
    age: p.birthDate ? ageFrom(p.birthDate, now) : null,
    teams: p.teams.map((t) => t.team).sort((a, b) => a.name.localeCompare(b.name, "fr")),
    account: p.user?.displayName ?? null,
    deletable: Object.values(p._count).every((n) => n === 0),
  }));
}

export type ClubPlayerInput = PlayerInput & { birthDate: Date | null };

function checkInput(input: ClubPlayerInput): ClubPlayerInput {
  const parsed = playerInputSchema.safeParse(input);
  if (!parsed.success) throw new DomainError("INVALID", parsed.error.issues[0]?.message ?? "Joueur invalide");
  return { ...parsed.data, birthDate: input.birthDate };
}

/** Ajoute une fiche joueur au club (sans équipe : on la place ensuite dans une équipe). */
export async function addClubPlayer(actorId: string, clubId: string, input: ClubPlayerInput): Promise<{ id: string }> {
  await requireLiveClubAdmin(actorId, clubId);
  const data = checkInput(input);
  return db.player.create({ data: { clubId, ...data }, select: { id: true } });
}

async function loadOwnPlayer(actorId: string, playerId: string) {
  const p = await db.player.findUnique({ where: { id: playerId }, select: { id: true, clubId: true } });
  if (!p) throw new DomainError("NOT_FOUND", "Joueur introuvable");
  await requireLiveClubAdmin(actorId, p.clubId).catch(() => {
    throw new DomainError("NOT_FOUND", "Joueur introuvable"); // un non-admin ne distingue pas « inexistant » de « interdit »
  });
  return p;
}

export async function updateClubPlayer(actorId: string, playerId: string, input: ClubPlayerInput): Promise<void> {
  await loadOwnPlayer(actorId, playerId);
  // Les cotes déjà figées ne bougent pas : elles sont copiées sur les matchs à l'ouverture.
  await db.player.update({ where: { id: playerId }, data: checkInput(input) });
}

/** Supprime une fiche : seulement si elle n'a jamais été alignée dans un match ni inscrite à un tournoi (historique des cotes). */
export async function deleteClubPlayer(actorId: string, playerId: string): Promise<void> {
  await loadOwnPlayer(actorId, playerId);
  const n = await db.player.findUniqueOrThrow({
    where: { id: playerId },
    select: { _count: { select: { homeMatches: true, awayMatches: true, homeMatches2: true, awayMatches2: true, tournamentEntries: true, tournamentHome: true, tournamentAway: true } } },
  });
  if (Object.values(n._count).some((c) => c > 0)) throw new DomainError("PLAYER_HAS_MATCHES", "Ce joueur a déjà été aligné dans un match ou inscrit à un tournoi : sa fiche est conservée");
  await db.player.delete({ where: { id: playerId } });
}

/** Place une fiche du club dans une équipe du club (admins). */
export async function addClubPlayerToTeam(actorId: string, teamId: string, playerId: string): Promise<void> {
  await addExistingPlayerToTeam(actorId, teamId, playerId);
}

// ─────────────────────────────── Import en lot ───────────────────────────────

/** Lit un fichier envoyé : CSV / texte (UTF-8 ou Windows-1252) ou Excel .xlsx (premier onglet). Les anciens .xls ne sont pas lus. */
export async function parseImportFile(file: { name: string; size: number; bytes: Buffer }, now = new Date()): Promise<ParsedImport> {
  if (file.size === 0 || file.bytes.length === 0) return { rows: [], fatal: "Le fichier est vide." };
  if (file.bytes.length > MAX_IMPORT_BYTES) return { rows: [], fatal: "Fichier trop lourd (5 Mo au maximum)." };
  const name = file.name.toLowerCase();
  try {
    if (name.endsWith(".xlsx")) return normalizeSheet(await readSheet(file.bytes), now);
    if (name.endsWith(".xls")) return { rows: [], fatal: "Ancien format Excel (.xls) : enregistre le fichier en .xlsx ou en .csv, puis recommence." };
    if (/\.(csv|txt|tsv)$/.test(name)) {
      let text = new TextDecoder("utf-8", { fatal: false }).decode(file.bytes);
      if (text.includes("�")) text = new TextDecoder("windows-1252").decode(file.bytes); // CSV exporté par un Excel français ancien
      return normalizeSheet(parseCsv(text), now);
    }
  } catch {
    return { rows: [], fatal: "Ce fichier n'a pas pu être lu : vérifie qu'il s'agit bien d'un fichier Excel (.xlsx) ou CSV valide." };
  }
  return { rows: [], fatal: "Format non pris en charge : envoie un fichier Excel (.xlsx) ou CSV (.csv)." };
}

export type ImportAction = "create" | "update" | "same" | "duplicate" | "error";
export type ImportPlanRow = ImportRow & { action: ImportAction; changes: string[]; existingId: string | null };
export type ImportSummary = { create: number; update: number; same: number; duplicate: number; error: number };

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const nameKey = (first: string, last: string) => `${fold(first)}|${fold(last)}`;
const dayKey = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
/** Même personne : mêmes prénom et nom, et dates de naissance égales ou inconnues d'un côté. */
const sameBirth = (a: Date | null, b: Date | null) => a === null || b === null || dayKey(a) === dayKey(b);

type Existing = { id: string; firstName: string; lastName: string; fftRank: FftRank; birthDate: Date | null };

/** Compare chaque ligne aux joueurs du club et entre elles : créer, mettre à jour (classement changé, date de naissance ajoutée), identique, doublon du fichier, erreur. */
function planImport(rows: readonly ImportRow[], existing: readonly Existing[]): { rows: ImportPlanRow[]; summary: ImportSummary } {
  const byName = new Map<string, Existing[]>();
  for (const e of existing) byName.set(nameKey(e.firstName, e.lastName), [...(byName.get(nameKey(e.firstName, e.lastName)) ?? []), e]);
  const seen = new Map<string, { birth: Date | null }[]>();
  const summary: ImportSummary = { create: 0, update: 0, same: 0, duplicate: 0, error: 0 };
  const out: ImportPlanRow[] = rows.map((r) => {
    const base = { ...r, changes: [] as string[], existingId: null as string | null };
    if (r.errors.length > 0) {
      summary.error++;
      return { ...base, action: "error" as const };
    }
    const k = nameKey(r.firstName, r.lastName);
    if ((seen.get(k) ?? []).some((s) => sameBirth(s.birth, r.birthDate))) {
      summary.duplicate++;
      return { ...base, action: "duplicate" as const, changes: ["Déjà présent plus haut dans le fichier"] };
    }
    seen.set(k, [...(seen.get(k) ?? []), { birth: r.birthDate }]);
    const match = (byName.get(k) ?? []).find((e) => sameBirth(e.birthDate, r.birthDate));
    if (!match) {
      summary.create++;
      return { ...base, action: "create" as const };
    }
    const changes: string[] = [];
    if (match.fftRank !== r.fftRank) changes.push(`Classement : ${fftLabel(match.fftRank)} → ${fftLabel(r.fftRank)}`);
    if (match.birthDate === null && r.birthDate !== null) changes.push("Date de naissance ajoutée");
    if (changes.length === 0) {
      summary.same++;
      return { ...base, action: "same" as const, existingId: match.id };
    }
    summary.update++;
    return { ...base, action: "update" as const, changes, existingId: match.id };
  });
  return { rows: out, summary };
}

async function loadExisting(clubId: string): Promise<Existing[]> {
  return db.player.findMany({ where: clubPlayerFilter(clubId), select: { id: true, firstName: true, lastName: true, fftRank: true, birthDate: true } });
}

/** Aperçu avant import (admins) : rien n'est enregistré. */
export async function previewImport(actorId: string, clubId: string, rows: readonly ImportRow[]): Promise<{ rows: ImportPlanRow[]; summary: ImportSummary }> {
  await requireLiveClubAdmin(actorId, clubId);
  return planImport(rows, await loadExisting(clubId));
}

/**
 * Importe les lignes valides (admins) : les nouvelles sont créées, les existantes mises à jour (classement changé, date de naissance ajoutée),
 * les identiques, doublons et lignes en erreur sont ignorés. Le plan est recalculé ici, sur l'état réel de la base, dans une seule transaction.
 */
export async function applyImport(actorId: string, clubId: string, rows: readonly ImportRow[]): Promise<ImportSummary> {
  await requireLiveClubAdmin(actorId, clubId);
  return db.$transaction(
    async (tx) => {
      const existing = await tx.player.findMany({ where: clubPlayerFilter(clubId), select: { id: true, firstName: true, lastName: true, fftRank: true, birthDate: true } });
      const plan = planImport(rows, existing);
      const creates = plan.rows.filter((r) => r.action === "create");
      for (let i = 0; i < creates.length; i += 1000) {
        await tx.player.createMany({ data: creates.slice(i, i + 1000).map((r) => ({ clubId, firstName: r.firstName, lastName: r.lastName, fftRank: r.fftRank, birthDate: r.birthDate })) });
      }
      for (const r of plan.rows) {
        if (r.action !== "update" || !r.existingId) continue;
        const old = existing.find((e) => e.id === r.existingId)!;
        await tx.player.update({ where: { id: r.existingId }, data: { fftRank: r.fftRank, ...(old.birthDate === null && r.birthDate !== null ? { birthDate: r.birthDate } : {}) } });
      }
      return plan.summary;
    },
    { timeout: 120_000, maxWait: 20_000 },
  );
}
