import type { FftRank, Side } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { type MatchResultInput, confirmScore, disputeScore, proposeScore } from "./scores";
import { signUpSchema } from "@/lib/validation/account";
import { registerUser } from "./accounts";
import { joinClub } from "./club-directory";
import { createClub } from "./clubs";
import { addMatch, cancelEncounter, createEncounter, publishEncounter } from "./encounters";
import { placePrediction } from "./predictions";
import { createStory, markStoryViewed, setCollectionPinned } from "./stories";
import { addNewPlayerToTeam, createExternalTeam, createTeam, setPlayerAccount } from "./teams";

// Jeu de données de démonstration (tranche 11). Tout passe par les vraies fonctions du produit :
// les soldes, le ledger, les cotes et les classements sont donc ceux que l'app produirait vraiment.
// Les dates sont relatives à `now` : relancer le seed le matin d'une démo remet tout à neuf.

export const DEMO_EMAIL_DOMAIN = "@demo.ralli.test";
export const DEMO_PASSWORD = "demo-ralli-2026";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const TABLES = ["StoryView", "Story", "LedgerEntry", "Prediction", "Match", "EncounterEvent", "Encounter", "TeamPlayer", "Player", "Team", "ClubMembership", "Club", "User"];

/** Vide toute la base (le ledger est append-only : seul TRUNCATE peut l'effacer). */
export async function wipeAll(): Promise<void> {
  await db.$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(", ")} CASCADE`);
}

export async function inspectDatabase(): Promise<{ demoUsers: number; otherUsers: number }> {
  const demoUsers = await db.user.count({ where: { email: { endsWith: DEMO_EMAIL_DOMAIN } } });
  const total = await db.user.count();
  return { demoUsers, otherUsers: total - demoUsers };
}

type Roster = [firstName: string, lastName: string, rank: FftRank][];

const LYON_M: Roster = [
  ["Thomas", "Bernard", "R15_2"],
  ["Hugo", "Lefèvre", "R15_4"],
  ["Maxime", "Rousseau", "R30"],
  ["Antoine", "Girard", "R30_2"],
  ["Julien", "Mercier", "R30_3"],
  ["Nicolas", "Fontaine", "R30_5"],
];
const LYON_D: Roster = [
  ["Camille", "Dubois", "R15_3"],
  ["Léa", "Martin", "R30_1"],
  ["Chloé", "Petit", "R30_2"],
  ["Manon", "Roux", "R30_4"],
  ["Sarah", "Vidal", "R30_5"],
  ["Inès", "Garnier", "R40"],
];
const NANTES_M: Roster = [
  ["Paul", "Lemoine", "R15_1"],
  ["Louis", "Chevalier", "R15_4"],
  ["Mathis", "Perrin", "R30_1"],
  ["Enzo", "Blanc", "R30_3"],
  ["Adrien", "Morel", "R30_4"],
];

const OPP_VILLEURBANNE: Roster = [
  ["Romain", "Duval", "R15_3"],
  ["Kevin", "Leroy", "R15_5"],
  ["Benoît", "Faure", "R30_1"],
  ["Damien", "Colin", "R30_2"],
  ["Pierre", "Robin", "R30_4"],
  ["Alexis", "Marchand", "R30_5"],
];
const OPP_MEYZIEU: Roster = [
  ["Julien", "Lopez", "R15_2"],
  ["Mehdi", "Benali", "R15_5"],
  ["Cédric", "Noël", "R30"],
  ["Florian", "Gauthier", "R30_3"],
  ["Samuel", "Carpentier", "R30_4"],
  ["Yanis", "Hamidi", "R30_5"],
];
const OPP_DECINES: Roster = [
  ["Axel", "Poirier", "R15_4"],
  ["Bastien", "Lacroix", "R15_5"],
  ["Gaëtan", "Renaud", "R30_1"],
  ["Loïc", "Meyer", "R30_2"],
  ["Tristan", "Schmitt", "R30_3"],
  ["Rémi", "Baron", "R30_5"],
];
const OPP_CALUIRE: Roster = [
  ["Emma", "Lambert", "R15_4"],
  ["Jade", "Fournier", "R30"],
  ["Zoé", "Andre", "R30_2"],
  ["Lola", "Guerin", "R30_3"],
  ["Anaïs", "Boyer", "R30_5"],
  ["Mélanie", "Clement", "R40"],
];
const OPP_BRON: Roster = [
  ["Pauline", "Masson", "R15_5"],
  ["Clara", "Henry", "R30_1"],
  ["Alice", "Barbier", "R30_3"],
  ["Juliette", "Brun", "R30_4"],
  ["Eva", "Dumont", "R30_5"],
  ["Lucie", "Joly", "R40"],
];
const OPP_REZE: Roster = [
  ["Gabriel", "Marechal", "R15_3"],
  ["Victor", "Aubert", "R15_5"],
  ["Théo", "Collet", "R30_1"],
  ["Clément", "Navarro", "R30_3"],
  ["Quentin", "Rey", "R30_4"],
];

const sets = (...pairs: ([number, number] | [number, number, true])[]) =>
  pairs.map(([home, away, superTiebreak]) => (superTiebreak ? { home, away, superTiebreak: true as const } : { home, away }));

/** Résultat « joué jusqu'au bout » cohérent avec le vainqueur. */
function won(side: Side, close = false): Omit<MatchResultInput, "matchId"> {
  if (close) {
    return {
      outcome: "COMPLETED",
      winnerSide: side,
      sets: side === "HOME" ? sets([6, 4], [3, 6], [10, 7, true]) : sets([4, 6], [6, 3], [7, 10, true]),
    };
  }
  return { outcome: "COMPLETED", winnerSide: side, sets: side === "HOME" ? sets([6, 3], [6, 4]) : sets([3, 6], [4, 6]) };
}

type Resolver = (index: number) => Omit<MatchResultInput, "matchId">;

export type DemoSummary = {
  password: string;
  accounts: { pseudo: string; role: string }[];
  clubs: { name: string; id: string }[];
};

/** Petite suite pseudo-aléatoire déterministe : deux exécutions donnent exactement les mêmes pronostics. */
function lcg(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export async function seedDemo(now: Date = new Date()): Promise<DemoSummary> {
  const rand = lcg(2026);
  const at = (offsetMs: number) => new Date(now.getTime() + offsetMs);

  // ── Comptes ──
  const users: Record<string, string> = {};
  const accounts: DemoSummary["accounts"] = [];
  async function user(pseudo: string, role: string) {
    const { id } = await registerUser(
      signUpSchema.parse({ email: `${pseudo}${DEMO_EMAIL_DOMAIN}`, displayName: pseudo, password: DEMO_PASSWORD }),
    );
    users[pseudo] = id;
    accounts.push({ pseudo, role });
    // Compte « ancien » : la connexion quotidienne (+10 Aces, popup) se déclenche dès la première ouverture.
    await db.user.update({ where: { id }, data: { createdAt: at(-30 * DAY), onboardingSeenAt: at(-30 * DAY) } });
    return id;
  }

  await user("admin_lyon", "Admin de TC Démo-Lyon");
  await user("capitaine_lyon", "Capitaine de Messieurs 1 (Lyon)");
  await user("capitaine_dames_lyon", "Capitaine de Dames 1 (Lyon)");
  await user("joueur_lyon", "Joueur lié à une fiche (Lyon, Messieurs 1)");
  await user("admin_nantes", "Admin de TC Démo-Nantes");
  await user("capitaine_nantes", "Capitaine de Messieurs 1 (Nantes)");
  await user("joueur_nantes", "Joueur lié à une fiche (Nantes)");
  await user("admin_bordeaux", "Admin de TC Démo-Bordeaux (club vide)");
  const parieurs = ["parieur1", "parieur2", "parieur3", "parieur4", "parieur5", "parieur6"];
  for (const p of parieurs) await user(p, "Membre qui pronostique");

  // ── Clubs et adhésions ──
  const lyon = await createClub(users.admin_lyon!, "TC Démo-Lyon");
  const nantes = await createClub(users.admin_nantes!, "TC Démo-Nantes");
  const bordeaux = await createClub(users.admin_bordeaux!, "TC Démo-Bordeaux");
  for (const p of ["capitaine_lyon", "capitaine_dames_lyon", "joueur_lyon", ...parieurs]) await joinClub(users[p]!, lyon.id);
  for (const p of ["capitaine_nantes", "joueur_nantes", "parieur1", "parieur2", "parieur3"]) await joinClub(users[p]!, nantes.id);

  // ── Équipes et joueurs ──
  async function club(adminId: string) {
    return {
      team: (clubId: string, name: string, captain: string) => createTeam(adminId, clubId, { name, captainUserId: users[captain]! }).then((t) => t.id),
      external: (clubId: string, name: string, externalClubName: string) =>
        createExternalTeam(adminId, clubId, { name, externalClubName }).then((t) => t.id),
      roster: async (teamId: string, r: Roster) => {
        const ids: string[] = [];
        for (const [firstName, lastName, fftRank] of r) ids.push((await addNewPlayerToTeam(adminId, teamId, { firstName, lastName, fftRank })).id);
        return ids;
      },
    };
  }
  const L = await club(users.admin_lyon!);
  const N = await club(users.admin_nantes!);

  const lyonM = await L.team(lyon.id, "Messieurs 1", "capitaine_lyon");
  const lyonD = await L.team(lyon.id, "Dames 1", "capitaine_dames_lyon");
  const lyonMp = await L.roster(lyonM, LYON_M);
  const lyonDp = await L.roster(lyonD, LYON_D);
  const nantesM = await N.team(nantes.id, "Messieurs 1", "capitaine_nantes");
  const nantesMp = await N.roster(nantesM, NANTES_M);

  const opp = {
    villeurbanne: await L.external(lyon.id, "TC Villeurbanne 1", "TC Villeurbanne"),
    meyzieu: await L.external(lyon.id, "TC Meyzieu 1", "TC Meyzieu"),
    decines: await L.external(lyon.id, "TC Décines 1", "TC Décines"),
    caluire: await L.external(lyon.id, "TC Caluire 1", "TC Caluire"),
    bron: await L.external(lyon.id, "TC Bron 1", "TC Bron"),
    reze: await N.external(nantes.id, "TC Rezé 1", "TC Rezé"),
  };
  const oppPlayers = {
    villeurbanne: await L.roster(opp.villeurbanne, OPP_VILLEURBANNE),
    meyzieu: await L.roster(opp.meyzieu, OPP_MEYZIEU),
    decines: await L.roster(opp.decines, OPP_DECINES),
    caluire: await L.roster(opp.caluire, OPP_CALUIRE),
    bron: await L.roster(opp.bron, OPP_BRON),
    reze: await N.roster(opp.reze, OPP_REZE),
  };

  // Liens fiche ↔ compte : à poser avant toute rencontre (ils sont gelés pendant une rencontre en cours).
  await setPlayerAccount(users.admin_lyon!, lyonMp[3]!, users.joueur_lyon!);
  await setPlayerAccount(users.admin_nantes!, nantesMp[3]!, users.joueur_nantes!);

  // ── Rencontres ──
  type Spec = {
    organizer: string; // capitaine ou admin qui crée
    reviewer: string; // seconde personne (confirme ou conteste)
    club: string;
    clubTeam: string;
    opponent: string;
    home: boolean;
    startsInMs: number;
    clubPlayers: string[];
    oppPlayers: string[];
    matches: number;
    /** Doubles ajoutés après les simples : indices des joueurs de l'équipe du club et de l'adversaire. */
    doubles?: { club: [number, number]; opp: [number, number]; points?: 1 | 2 }[];
    bettors: string[];
  };

  /** Crée la rencontre et pose les pronostics à des dates cohérentes avec son début (passé ou futur). */
  async function build(s: Spec) {
    const startsAt = at(s.startsInMs);
    const createdAt = new Date(startsAt.getTime() - 5 * DAY);
    const openAt = new Date(startsAt.getTime() - 3 * DAY);
    const betAt = s.startsInMs > 0 ? now : new Date(startsAt.getTime() - 2 * HOUR);
    // Une rencontre à venir est créée « maintenant » (début futur exigé), une passée « il y a 5 jours avant son début ».
    const created = s.startsInMs > 0 ? now : createdAt;
    const { id } = await createEncounter(users[s.organizer]!, { clubTeamId: s.clubTeam, opponentTeamId: s.opponent, clubTeamIsHome: s.home, startsAt }, created);
    const matchIds: string[] = [];
    for (let i = 0; i < s.matches; i++) {
      const [home, away] = s.home ? [s.clubPlayers[i]!, s.oppPlayers[i]!] : [s.oppPlayers[i]!, s.clubPlayers[i]!];
      matchIds.push((await addMatch(users[s.organizer]!, id, { homePlayerId: home, awayPlayerId: away }, created)).id);
    }
    for (const d of s.doubles ?? []) {
      const club = [s.clubPlayers[d.club[0]]!, s.clubPlayers[d.club[1]]!] as const;
      const opp = [s.oppPlayers[d.opp[0]]!, s.oppPlayers[d.opp[1]]!] as const;
      const [home, away] = s.home ? [club, opp] : [opp, club];
      matchIds.push(
        (
          await addMatch(
            users[s.organizer]!,
            id,
            { homePlayerId: home[0], homePlayer2Id: home[1], awayPlayerId: away[0], awayPlayer2Id: away[1], points: d.points },
            created,
          )
        ).id,
      );
    }
    return { id, matchIds, startsAt, betAt, openAt: s.startsInMs > 0 ? now : openAt, created, spec: s };
  }
  type Built = Awaited<ReturnType<typeof build>>;

  async function publish(b: Built) {
    await publishEncounter(users[b.spec.organizer]!, b.id, b.openAt);
  }

  /** Chaque parieur prend position sur la plupart des matchs (côté et montant variés, jamais deux fois le même). */
  async function bet(b: Built) {
    for (const [pi, p] of b.spec.bettors.entries()) {
      for (const [mi, matchId] of b.matchIds.entries()) {
        if ((pi + mi) % 5 === 4) continue; // chacun saute quelques matchs
        const side: Side = rand() < 0.5 ? "HOME" : "AWAY";
        const aces = (1 + Math.floor(rand() * 3)) * 10; // 10 à 30 : le solde de 1000 Aces suffit pour toute la démo
        await placePrediction(users[p]!, { matchId, side, committedAces: aces }, b.betAt);
      }
    }
  }

  async function playedAndConfirmed(b: Built, resolve: Resolver, proposeAt: Date, confirmAt: Date) {
    const results: MatchResultInput[] = b.matchIds.map((matchId, i) => ({ matchId, ...resolve(i) }));
    await proposeScore(users[b.spec.organizer]!, b.id, results, proposeAt);
    await confirmScore(users[b.spec.reviewer]!, b.id, confirmAt);
  }

  const lyonBase = { club: lyon.id, bettors: parieurs, clubPlayers: [] as string[], oppPlayers: [] as string[] };
  const M = { organizer: "capitaine_lyon", reviewer: "admin_lyon", clubTeam: lyonM, clubPlayers: lyonMp };
  const D = { organizer: "capitaine_dames_lyon", reviewer: "admin_lyon", clubTeam: lyonD, clubPlayers: lyonDp };

  // Résultats de l'historique : plus d'une surprise (le moins bien classé gagne) pour que les classements bougent.
  const sides = (...s: (Side | `${Side}!`)[]): Resolver => (i) => {
    const v = s[i]!;
    return won(v.slice(0, 4) === "HOME" ? "HOME" : "AWAY", v.endsWith("!"));
  };

  // 1. Terminées (du plus ancien au plus récent, pour que forme et face-à-face s'accumulent dans l'ordre).
  const h1 = await build({ ...lyonBase, ...M, opponent: opp.villeurbanne, oppPlayers: oppPlayers.villeurbanne, home: true, startsInMs: -21 * DAY, matches: 4, doubles: [{ club: [0, 1], opp: [0, 1] }] });
  await publish(h1);
  await bet(h1);
  await playedAndConfirmed(h1, sides("HOME", "HOME!", "AWAY", "HOME", "HOME"), new Date(h1.startsAt.getTime() + 4 * HOUR), new Date(h1.startsAt.getTime() + 5 * HOUR));

  const h2 = await build({ ...lyonBase, ...D, opponent: opp.caluire, oppPlayers: oppPlayers.caluire, home: false, startsInMs: -14 * DAY, matches: 4 });
  await publish(h2);
  await bet(h2);
  await playedAndConfirmed(h2, sides("HOME", "HOME", "AWAY", "HOME"), new Date(h2.startsAt.getTime() + 4 * HOUR), new Date(h2.startsAt.getTime() + 5 * HOUR));

  const h3 = await build({ ...lyonBase, ...M, opponent: opp.meyzieu, oppPlayers: oppPlayers.meyzieu, home: false, startsInMs: -8 * DAY, matches: 4, doubles: [{ club: [1, 2], opp: [1, 2], points: 2 }] });
  await publish(h3);
  await bet(h3);
  await playedAndConfirmed(h3, sides("AWAY", "HOME", "HOME", "HOME", "AWAY"), new Date(h3.startsAt.getTime() + 4 * HOUR), new Date(h3.startsAt.getTime() + 5 * HOUR));

  const n1 = await build({
    club: nantes.id,
    organizer: "capitaine_nantes",
    reviewer: "admin_nantes",
    clubTeam: nantesM,
    clubPlayers: nantesMp,
    opponent: opp.reze,
    oppPlayers: oppPlayers.reze,
    home: true,
    startsInMs: -6 * DAY,
    matches: 4,
    bettors: ["parieur1", "parieur2", "parieur3"],
  });
  await publish(n1);
  await bet(n1);
  await playedAndConfirmed(n1, sides("HOME", "AWAY!", "HOME", "HOME"), new Date(n1.startsAt.getTime() + 4 * HOUR), new Date(n1.startsAt.getTime() + 5 * HOUR));

  // Terminée il y a quelques heures : elle compte dans le classement « semaine ».
  const h4 = await build({ ...lyonBase, ...D, opponent: opp.bron, oppPlayers: oppPlayers.bron, home: true, startsInMs: -4 * HOUR, matches: 3 });
  await publish(h4);
  await bet(h4);
  await playedAndConfirmed(h4, sides("HOME", "AWAY", "HOME!"), at(-2 * HOUR), now);

  // 2. Score contesté (proposé par le capitaine, contesté par l'admin) : les pronostics attendent l'arbitrage.
  const dis = await build({ ...lyonBase, ...M, opponent: opp.decines, oppPlayers: oppPlayers.decines, home: true, startsInMs: -2 * DAY, matches: 3 });
  await publish(dis);
  await bet(dis);
  await proposeScore(
    users.capitaine_lyon!,
    dis.id,
    dis.matchIds.map((matchId, i) => ({ matchId, ...won(i === 1 ? "AWAY" : "HOME") })),
    new Date(dis.startsAt.getTime() + 4 * HOUR),
  );
  await disputeScore(users.admin_lyon!, dis.id, "Le match 2 s'est arrêté sur abandon, pas sur le score saisi.", new Date(dis.startsAt.getTime() + 6 * HOUR));

  // 3. Score proposé, en attente de la seconde personne.
  const prop = await build({ ...lyonBase, ...D, opponent: opp.villeurbanne, oppPlayers: oppPlayers.villeurbanne, home: false, startsInMs: -1 * DAY, matches: 3 });
  await publish(prop);
  await bet(prop);
  await proposeScore(
    users.capitaine_dames_lyon!,
    prop.id,
    prop.matchIds.map((matchId, i) => ({ matchId, ...won(i === 2 ? "AWAY" : "HOME") })),
    at(-12 * HOUR),
  );

  // 4. Verrouillée : commencée il y a une heure, pronostics fermés, score pas encore saisi.
  const locked = await build({ ...lyonBase, ...M, opponent: opp.villeurbanne, oppPlayers: oppPlayers.villeurbanne.slice().reverse(), home: false, startsInMs: -1 * HOUR, matches: 3 });
  await publish(locked);
  await bet(locked);

  // 5. Annulée (pluie) : les Aces des pronostics ont été remboursés.
  const cancelled = await build({ ...lyonBase, ...D, opponent: opp.caluire, oppPlayers: oppPlayers.caluire, home: true, startsInMs: 5 * DAY, matches: 3 });
  await publish(cancelled);
  await bet(cancelled);
  await cancelEncounter(users.capitaine_dames_lyon!, cancelled.id, "Terrain impraticable (pluie), rencontre annulée", now);

  // 6. À venir, pronostics ouverts (Lyon et Nantes).
  const open = await build({ ...lyonBase, ...M, opponent: opp.meyzieu, oppPlayers: oppPlayers.meyzieu, home: true, startsInMs: 3 * DAY, matches: 4, doubles: [{ club: [2, 3], opp: [2, 3], points: 2 }] });
  await publish(open);
  await bet(open);

  const nOpen = await build({
    club: nantes.id,
    organizer: "capitaine_nantes",
    reviewer: "admin_nantes",
    clubTeam: nantesM,
    clubPlayers: nantesMp,
    opponent: opp.reze,
    oppPlayers: oppPlayers.reze,
    home: false,
    startsInMs: 4 * DAY,
    matches: 3,
    bettors: ["parieur1", "parieur2", "parieur3"],
  });
  await publish(nOpen);
  await bet(nOpen);

  // 7. Brouillon : visible des admins et capitaines seulement, pas publié.
  await build({ ...lyonBase, ...D, opponent: opp.bron, oppPlayers: oppPlayers.bron, home: true, startsInMs: 10 * DAY, matches: 3 });

  // ── Stories : une annonce épinglée à la une de Lyon, une story d'équipe, une annonce à Nantes (déjà vue par parieur1) ──
  const lyonNews = await createStory(users.admin_lyon!, { clubId: lyon.id, teamId: null, body: "Interclubs samedi : rendez-vous à 13 h au club, tenue du club obligatoire.", background: "brand", onWall: true, collectionName: "Interclubs de la saison" }, now);
  const lyonCollection = await db.story.findUniqueOrThrow({ where: { id: lyonNews.id }, select: { collectionId: true } });
  await setCollectionPinned(users.admin_lyon!, lyonCollection.collectionId!, true, now);
  await createStory(users.capitaine_lyon!, { clubId: lyon.id, teamId: lyonM, body: "Messieurs 1 : composition confirmée ce soir, soyez à l'heure !", background: "clay", onWall: false }, now);
  const nantesNews = await createStory(users.admin_nantes!, { clubId: nantes.id, teamId: null, body: "Le club ferme à 20 h ce vendredi.", background: "gold", onWall: false }, now);
  await markStoryViewed(users.parieur1!, nantesNews.id, now);

  // Les résultats déjà réglés de la démo ne sont pas remontés en récapitulatif à la première connexion.
  await db.user.updateMany({ where: { id: { in: Object.values(users) } }, data: { resultsSeenAt: new Date() } });

  return {
    password: DEMO_PASSWORD,
    accounts,
    clubs: [
      { name: "TC Démo-Lyon", id: lyon.id },
      { name: "TC Démo-Nantes", id: nantes.id },
      { name: "TC Démo-Bordeaux", id: bordeaux.id },
    ],
  };
}
