import type { EncounterStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { signUpSchema } from "@/lib/validation/account";
import { registerUser } from "@/server/accounts";

export async function makeUser(name: string): Promise<string> {
  const { id } = await registerUser(
    signUpSchema.parse({ email: `${name.toLowerCase()}@club.fr`, displayName: name, password: "motdepasse", ageConfirmed: "on" }),
  );
  return id;
}

/**
 * Rencontre minimale contenant un match où joue `playerId`, insérée directement en base
 * (les services de rencontre arrivent à la tranche 5).
 */
export async function makeEncounterWithPlayer(opts: {
  clubId: string;
  createdById: string;
  playerId: string;
  status: EncounterStatus;
  settled?: boolean;
}): Promise<string> {
  const home = await db.team.create({ data: { clubId: opts.clubId, name: `Dom ${Math.random()}` } });
  const away = await db.team.create({ data: { clubId: opts.clubId, kind: "EXTERNAL", name: `Ext ${Math.random()}`, externalClubName: "TC Voisin" } });
  const opponent = await db.player.create({ data: { clubId: opts.clubId, firstName: "Adv", lastName: "Ersaire", fftRank: "R30" } });
  const enc = await db.encounter.create({
    data: {
      organizerClubId: opts.clubId,
      homeTeamId: home.id,
      awayTeamId: away.id,
      startsAt: new Date(Date.now() + 86_400_000),
      predictionsCloseAt: new Date(Date.now() + 86_400_000),
      status: opts.status,
      createdById: opts.createdById,
      settledAt: opts.settled ? new Date() : null,
      matches: { create: { order: 1, homePlayerId: opts.playerId, awayPlayerId: opponent.id } },
    },
  });
  return enc.id;
}
