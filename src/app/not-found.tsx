import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <section className="space-y-4">
      <h1 className="font-serif text-3xl text-primary">Page introuvable</h1>
      <p className="text-ink-muted">Cette page n&apos;existe pas, ou vous n&apos;y avez pas accès.</p>
      <ButtonLink href="/">Retour à l&apos;accueil</ButtonLink>
    </section>
  );
}
