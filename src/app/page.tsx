export default function Home() {
  return (
    <section className="space-y-4">
      <h1 className="font-serif text-3xl text-primary">Bienvenue sur Ralli</h1>
      <p>Pronostiquez les rencontres d&apos;interclubs de votre club avec vos Aces.</p>
      <div className="flex flex-wrap gap-3">
        <span className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 font-semibold text-on-primary">
          Bouton primaire
        </span>
        <span className="inline-flex min-h-11 items-center rounded-full bg-accent px-3 font-semibold text-on-accent">
          Cote 1.56
        </span>
        <span className="inline-flex min-h-11 items-center rounded-full bg-success px-3 font-semibold text-on-success">
          Pronostic gagné
        </span>
      </div>
      <div className="rounded-xl bg-surface p-4 shadow-sm">
        <p className="text-ink-muted">Carte blanche · texte secondaire</p>
        <p className="font-semibold text-success-ink">+150 Aces gagnés</p>
      </div>
    </section>
  );
}
