import type { ClubRole, EncounterStatus, FftRank, TeamKind } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { PlayerInput } from "@/lib/validation/team";
import { DomainError, isUniqueViolation } from "./errors";
import {
  ADMIN_ONLY,
  canManageTeam,
  isCaptainInClub,
  requireClubAdmin,
  requireClubMember,
} from "./permissions";

// Équipes et joueurs. Chaque fonction prend l'acteur et vérifie ses droits en base.

const TEAM_NOT_FOUND = new DomainError("NOT_FOUND", "Équipe introuvable");
const PLAYER_NOT_FOUND = new DomainError("NOT_FOUND", "Joueur introuvable");
const CANNOT_MANAGE = new DomainError("FORBIDDEN", "Seuls l'admin du club et le capitaine de l'équipe peuvent faire cela");
const NAME_TAKEN = new DomainError("TEAM_NAME_TAKEN", "Une équipe porte déjà ce nom dans le club");

/**
 * Statuts stockés pendant lesquels le lien joueur ↔ compte est figé (décision 9 du brief).
 * LOCKED est dérivé de OPEN, il est donc couvert.
 */
export const LINK_FROZEN_STATUSES: EncounterStatus[] = ["OPEN", "SCORE_PROPOSED"];

async function loadTeam(teamId: string) {
  const team = await db.team.findUnique({
    where: { id: teamId },
    select: { id: true, clubId: true, kind: true, captainId: true, name: true },
  });
  if (!team) throw TEAM_NOT_FOUND;
  return team;
}

/** Équipe + rôle de l'acteur ; NOT_FOUND si l'acteur n'est pas membre du club. */
async function teamForActor(actorId: string, teamId: string) {
  const team = await loadTeam(teamId);
  const role = await requireClubMember(actorId, team.clubId).catch(() => {
    throw TEAM_NOT_FOUND;
  });
  return { team, role };
}

async function requireManageTeam(actorId: string, teamId: string) {
  const { team, role } = await teamForActor(actorId, teamId);
  if (!(await canManageTeam(actorId, role, team))) throw CANNOT_MANAGE;
  return { team, role };
}

async function requireMemberOf(userId: string, clubId: string, message: string) {
  const m = await db.clubMembership.findUnique({ where: { userId_clubId: { userId, clubId } } });
  if (!m) throw new DomainError("NOT_A_MEMBER", message);
}

/** Un joueur est géré via ses équipes : l'acteur doit pouvoir gérer au moins l'une d'elles. */
async function requireManagePlayer(actorId: string, playerId: string) {
  const player = await db.player.findUnique({
    where: { id: playerId },
    select: {
      id: true,
      clubId: true,
      userId: true,
      teams: { select: { team: { select: { id: true, clubId: true, kind: true, captainId: true } } } },
    },
  });
  if (!player) throw PLAYER_NOT_FOUND;
  const role = await requireClubMember(actorId, player.clubId).catch(() => {
    throw PLAYER_NOT_FOUND;
  });
  if (role !== "ADMIN") {
    let ok = false;
    for (const { team } of player.teams) {
      if (await canManageTeam(actorId, role, team)) {
        ok = true;
        break;
      }
    }
    if (!ok) throw CANNOT_MANAGE;
  }
  return { player, role, isExternal: player.teams.some((t) => t.team.kind === "EXTERNAL") };
}

// ─────────────────────────────── Équipes ───────────────────────────────

export async function createTeam(
  actorId: string,
  clubId: string,
  input: { name: string; captainUserId: string },
): Promise<{ id: string }> {
  await requireClubAdmin(actorId, clubId);
  await requireMemberOf(input.captainUserId, clubId, "Le capitaine doit être membre du club");
  try {
    return await db.team.create({
      data: { clubId, kind: "CLUB", name: input.name, captainId: input.captainUserId },
      select: { id: true },
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw NAME_TAKEN;
    throw e;
  }
}

export async function setTeamCaptain(actorId: string, teamId: string, captainUserId: string): Promise<void> {
  const { team, role } = await teamForActor(actorId, teamId);
  if (role !== "ADMIN") throw ADMIN_ONLY;
  if (team.kind !== "CLUB") throw new DomainError("INVALID", "Une équipe externe n'a pas de capitaine");
  await requireMemberOf(captainUserId, team.clubId, "Le capitaine doit être membre du club");
  await db.team.update({ where: { id: teamId }, data: { captainId: captainUserId } });
}

/** Adversaire hors Ralli. Créable par l'admin ou un capitaine du club. */
export async function createExternalTeam(
  actorId: string,
  clubId: string,
  input: { name: string; externalClubName: string },
): Promise<{ id: string }> {
  const role = await requireClubMember(actorId, clubId);
  if (role !== "ADMIN" && !(await isCaptainInClub(actorId, clubId))) {
    throw new DomainError("FORBIDDEN", "Réservé aux admins et capitaines du club");
  }
  try {
    return await db.team.create({
      data: { clubId, kind: "EXTERNAL", name: input.name, externalClubName: input.externalClubName },
      select: { id: true },
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw NAME_TAKEN;
    throw e;
  }
}

// ─────────────────────────────── Effectifs ───────────────────────────────

/** Crée une fiche joueur dans le club et l'ajoute à l'équipe. */
export async function addNewPlayerToTeam(actorId: string, teamId: string, input: PlayerInput): Promise<{ id: string }> {
  const { team } = await requireManageTeam(actorId, teamId);
  return db.player.create({
    data: { clubId: team.clubId, ...input, teams: { create: { teamId } } },
    select: { id: true },
  });
}

/** Ajoute à une équipe du club un joueur qui joue déjà dans une autre équipe du club. */
export async function addExistingPlayerToTeam(actorId: string, teamId: string, playerId: string): Promise<void> {
  const { team } = await requireManageTeam(actorId, teamId);
  if (team.kind !== "CLUB") throw new DomainError("INVALID", "Les joueurs d'une équipe externe se saisissent directement");
  const candidate = await db.player.findFirst({
    where: { id: playerId, clubId: team.clubId, OR: [{ teams: { some: { team: { kind: "CLUB" } } } }, { teams: { none: {} } }] },
    select: { id: true },
  });
  if (!candidate) throw PLAYER_NOT_FOUND;
  try {
    await db.teamPlayer.create({ data: { teamId, playerId } });
  } catch (e) {
    if (isUniqueViolation(e)) throw new DomainError("ALREADY_IN_TEAM", "Ce joueur fait déjà partie de l'équipe");
    throw e;
  }
}

export async function removePlayerFromTeam(actorId: string, teamId: string, playerId: string): Promise<void> {
  await requireManageTeam(actorId, teamId);
  const r = await db.teamPlayer.deleteMany({ where: { teamId, playerId } });
  if (r.count === 0) throw PLAYER_NOT_FOUND;
}

export async function updatePlayer(actorId: string, playerId: string, input: PlayerInput): Promise<void> {
  await requireManagePlayer(actorId, playerId);
  // Les cotes déjà figées ne bougent pas : elles sont copiées sur les matchs à l'ouverture.
  await db.player.update({ where: { id: playerId }, data: input });
}

/** Le joueur est l'un des (deux ou quatre) joueurs du match : simple ou double. */
const playerInMatch = (playerId: string) => [
  { homePlayerId: playerId },
  { awayPlayerId: playerId },
  { homePlayer2Id: playerId },
  { awayPlayer2Id: playerId },
];

/** Suppression d'une fiche : seulement si elle n'a jamais été alignée dans un match (historique des cotes). */
export async function deletePlayer(actorId: string, playerId: string): Promise<void> {
  await requireManagePlayer(actorId, playerId);
  const matches = await db.match.count({ where: { OR: playerInMatch(playerId) } });
  if (matches > 0) {
    throw new DomainError("PLAYER_HAS_MATCHES", "Ce joueur a déjà été aligné dans un match : sa fiche est conservée");
  }
  await db.player.delete({ where: { id: playerId } });
}

/** Le joueur figure-t-il dans une rencontre en cours (ouverte, verrouillée ou score proposé) ? */
async function isInLiveEncounter(playerId: string): Promise<boolean> {
  const n = await db.match.count({
    where: {
      OR: playerInMatch(playerId),
      encounter: { status: { in: LINK_FROZEN_STATUSES }, settledAt: null },
    },
  });
  return n > 0;
}

/**
 * Lie (userId) ou délie (null) une fiche joueur à un compte membre du club.
 * Refusé dans les deux sens pendant une rencontre en cours : délier permettrait
 * à un joueur aligné de pronostiquer sa propre rencontre.
 */
export async function setPlayerAccount(actorId: string, playerId: string, userId: string | null): Promise<void> {
  const { player, isExternal } = await requireManagePlayer(actorId, playerId);
  if (isExternal) throw new DomainError("INVALID", "Un joueur d'une équipe externe ne peut pas être lié à un compte");
  if (player.userId === userId) return;
  if (await isInLiveEncounter(playerId)) {
    throw new DomainError(
      "PLAYER_LOCKED",
      "Ce joueur figure dans une rencontre en cours : le lien avec un compte ne peut pas changer avant son règlement",
    );
  }
  if (userId) await requireMemberOf(userId, player.clubId, "Ce compte n'est pas membre du club");
  try {
    await db.player.update({ where: { id: playerId }, data: { userId } });
  } catch (e) {
    if (isUniqueViolation(e)) throw new DomainError("ALREADY_LINKED", "Ce compte est déjà lié à une autre fiche joueur");
    throw e;
  }
}

// ─────────────────────────────── Lecture ───────────────────────────────

export type TeamSummary = {
  id: string;
  name: string;
  kind: TeamKind;
  externalClubName: string | null;
  captain: { userId: string; displayName: string } | null;
  playerCount: number;
};

/** Équipes d'un club (membres uniquement). */
export async function listClubTeams(actorId: string, clubId: string): Promise<TeamSummary[]> {
  await requireClubMember(actorId, clubId);
  const teams = await db.team.findMany({
    where: { clubId },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      kind: true,
      externalClubName: true,
      captain: { select: { id: true, displayName: true } },
      _count: { select: { players: true } },
    },
  });
  return teams.map((t) => ({
    id: t.id,
    name: t.name,
    kind: t.kind,
    externalClubName: t.externalClubName,
    captain: t.captain ? { userId: t.captain.id, displayName: t.captain.displayName } : null,
    playerCount: t._count.players,
  }));
}

export type TeamView = {
  id: string;
  clubId: string;
  clubName: string;
  name: string;
  kind: TeamKind;
  externalClubName: string | null;
  captain: { userId: string; displayName: string } | null;
  myRole: ClubRole;
  canManage: boolean;
  isAdmin: boolean;
  players: {
    id: string;
    firstName: string;
    lastName: string;
    fftRank: FftRank;
    account: { userId: string; displayName: string } | null;
    hasMatches: boolean;
  }[];
  /** Pour les gestionnaires : joueurs du club ajoutables (déjà dans une autre équipe du club). */
  addablePlayers: { id: string; firstName: string; lastName: string; fftRank: FftRank }[];
  /** Pour les gestionnaires : membres du club (choix du capitaine, lien de compte). */
  members: { userId: string; displayName: string }[];
};

export async function getTeamView(actorId: string, teamId: string): Promise<TeamView> {
  const { team, role } = await teamForActor(actorId, teamId);
  const canManage = await canManageTeam(actorId, role, team);
  const full = await db.team.findUniqueOrThrow({
    where: { id: teamId },
    select: {
      name: true,
      externalClubName: true,
      club: { select: { name: true } },
      captain: { select: { id: true, displayName: true } },
      players: {
        orderBy: { player: { lastName: "asc" } },
        select: {
          player: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              fftRank: true,
              user: { select: { id: true, displayName: true } },
              _count: { select: { homeMatches: true, awayMatches: true } },
            },
          },
        },
      },
    },
  });

  const players = full.players.map(({ player: p }) => ({
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    fftRank: p.fftRank,
    account: p.user ? { userId: p.user.id, displayName: p.user.displayName } : null,
    hasMatches: p._count.homeMatches + p._count.awayMatches > 0,
  }));

  let addablePlayers: TeamView["addablePlayers"] = [];
  let members: TeamView["members"] = [];
  if (canManage) {
    const inTeam = new Set(players.map((p) => p.id));
    if (team.kind === "CLUB") {
      const candidates = await db.player.findMany({
        where: { clubId: team.clubId, externalClubName: null, OR: [{ teams: { some: { team: { kind: "CLUB" } } } }, { teams: { none: {} } }] },
        orderBy: { lastName: "asc" },
        select: { id: true, firstName: true, lastName: true, fftRank: true },
      });
      addablePlayers = candidates.filter((p) => !inTeam.has(p.id));
    }
    const ms = await db.clubMembership.findMany({
      where: { clubId: team.clubId },
      orderBy: { user: { displayName: "asc" } },
      select: { user: { select: { id: true, displayName: true } } },
    });
    members = ms.map((m) => ({ userId: m.user.id, displayName: m.user.displayName }));
  }

  return {
    id: team.id,
    clubId: team.clubId,
    clubName: full.club.name,
    name: full.name,
    kind: team.kind,
    externalClubName: full.externalClubName,
    captain: full.captain ? { userId: full.captain.id, displayName: full.captain.displayName } : null,
    myRole: role,
    canManage,
    isAdmin: role === "ADMIN",
    players,
    addablePlayers,
    members,
  };
}

/** Membres d'un club pour le choix d'un capitaine (admin uniquement). */
export async function listClubMembersForAdmin(actorId: string, clubId: string) {
  await requireClubAdmin(actorId, clubId);
  const ms = await db.clubMembership.findMany({
    where: { clubId },
    orderBy: { user: { displayName: "asc" } },
    select: { user: { select: { id: true, displayName: true } } },
  });
  return ms.map((m) => ({ userId: m.user.id, displayName: m.user.displayName }));
}
