import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui";
import { DAILY_LOGIN_BONUS_ACES, SIGNUP_BONUS_ACES, STREAK_BONUS_ACES, STREAK_LENGTH_DAYS, WEEKLY_BONUS_ACES, WEEKLY_BONUS_THRESHOLD_ACES } from "@/config/game";

export const metadata: Metadata = {
  title: "Comment ça marche · Ralli",
  description: "Pronostique les rencontres d'interclubs de ton club avec des Aces, une monnaie fictive sans aucune valeur.",
};

const aces = (n: number) => n.toLocaleString("fr-FR");

// Page publique et statique : les montants viennent de src/config/game.ts, donc ne se périment pas.
const STEPS: { title: string; body: React.ReactNode }[] = [
  {
    title: "Rejoins ton club",
    body: (
      <p>
        Cherche ton club dans Ralli et appuie sur « Rejoindre le club ». Tu vois les rencontres d&apos;interclubs que ton capitaine ou ton admin publie, avec leurs joueurs.
      </p>
    ),
  },
  {
    title: "Fais ton ralli",
    body: (
      <p>
        Touche une rencontre, puis la cote du joueur que tu vois gagner. Choisis combien d&apos;Aces tu engages (50, 100, 250, tout ou le montant que tu veux), puis « Valider mon ralli ». La cote est fixée à la publication de la rencontre et tu peux pronostiquer jusqu&apos;à l&apos;heure du début.
      </p>
    ),
  },
  {
    title: "Le score tombe",
    body: (
      <p>
        Une fois la rencontre jouée, ton club enregistre le score. Si ton joueur gagne, tu reçois tes Aces engagés multipliés par la cote : 100 Aces à la cote 1,80 te rapportent 180 Aces. S&apos;il perd, ils ne reviennent pas. Si la rencontre est annulée ou le match remplacé, tes Aces te sont rendus.
      </p>
    ),
  },
  {
    title: "Gagne des Aces",
    body: (
      <ul className="space-y-1">
        <li>
          <strong>{aces(SIGNUP_BONUS_ACES)} Aces</strong> à l&apos;inscription.
        </li>
        <li>
          <strong>+{DAILY_LOGIN_BONUS_ACES} Aces</strong> chaque jour où tu ouvres l&apos;app, et <strong>+{STREAK_BONUS_ACES}</strong> de plus tous les {STREAK_LENGTH_DAYS} jours d&apos;affilée.
        </li>
        <li>
          <strong>+{WEEKLY_BONUS_ACES} Aces</strong> chaque lundi si tu en as moins de {aces(WEEKLY_BONUS_THRESHOLD_ACES)}.
        </li>
        <li>Et bien sûr tes rallis gagnants.</li>
      </ul>
    ),
  },
  {
    title: "Monte au classement",
    body: (
      <p>
        Chaque club a son classement, sur la saison et sur la semaine. Il compte ton bénéfice : tes Aces gagnés moins tes Aces engagés sur les rallis terminés. Il faut au moins 3 rallis terminés sur la saison pour y apparaître.
      </p>
    ),
  },
  {
    title: "Reste à la une de ton club",
    body: (
      <p>
        Les admins et les capitaines publient des stories (visibles 24 h) pour les annonces du club, et gardent les plus importantes « à la une » sur la page du club.
      </p>
    ),
  },
];

export default function HowItWorksPage() {
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="font-serif text-3xl text-primary">Comment ça marche</h1>
        <p className="text-ink-muted">Ralli, c&apos;est pronostiquer les rencontres d&apos;interclubs de ton club avec tes coéquipiers, pour le plaisir.</p>
      </div>

      <ol className="space-y-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-4 rounded-2xl bg-surface p-4 shadow-sm" data-testid="how-step">
            <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-brand font-serif text-xl font-bold text-on-primary">
              {i + 1}
            </span>
            <div className="min-w-0 space-y-1">
              <h2 className="font-serif text-xl text-primary">{s.title}</h2>
              <div className="text-ink">{s.body}</div>
            </div>
          </li>
        ))}
      </ol>

      <div className="space-y-2 rounded-2xl bg-pale p-4" data-testid="how-rules">
        <h2 className="font-serif text-xl text-primary">Les règles du jeu</h2>
        <ul className="list-disc space-y-1 pl-5 text-ink">
          <li>Les Aces sont une monnaie fictive : ils n&apos;ont aucune valeur, ne s&apos;achètent pas et ne se convertissent en rien. Il n&apos;y a ni lot ni publicité.</li>
          <li>Pour que ce soit équitable, tu ne peux pas pronostiquer une rencontre de ton club si tu en es admin, capitaine d&apos;une des deux équipes, ou joueur aligné.</li>
        </ul>
      </div>

      <div className="flex flex-wrap gap-3">
        <ButtonLink href="/inscription">Créer mon compte</ButtonLink>
        <ButtonLink href="/connexion" variant="ghost">
          Se connecter
        </ButtonLink>
      </div>
      <p>
        <Link href="/" className="inline-flex min-h-11 items-center text-primary underline">
          Retour à l&apos;accueil
        </Link>
      </p>
    </section>
  );
}
