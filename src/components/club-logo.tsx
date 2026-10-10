import { clubInitials, logoSrc } from "@/lib/clubs/profile";

/**
 * Logo du club dans un cadre carré, jamais recadré (un blason reste entier, avec de l'air autour).
 * Sans logo : pastille verte Ralli avec les initiales. Décoratif : le nom du club est toujours écrit à côté.
 */
export function ClubLogo({
  club,
  size = 48,
  className = "",
}: {
  club: { id: string; name: string; logoUpdatedAt: Date | null };
  size?: number;
  className?: string;
}) {
  const src = logoSrc(club);
  const box = { width: size, height: size };
  if (src) {
    return (
      // Image déjà redimensionnée (512 px au plus) : l'optimiseur de next/image n'apporte rien ici.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className={`shrink-0 rounded-xl border border-line bg-surface object-contain p-1 ${className}`}
        style={box}
        data-testid="club-logo"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-xl bg-brand font-serif font-bold text-on-primary ${className}`}
      style={{ ...box, fontSize: Math.round(size * 0.4) }}
      data-testid="club-logo-initials"
    >
      {clubInitials(club.name)}
    </span>
  );
}
