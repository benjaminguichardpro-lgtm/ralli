import { type AvatarRef, avatarSrc } from "@/lib/avatars";

/** Avatar rond (photo importée ou personnage prédéfini). Décoratif : le pseudo est toujours écrit à côté. */
export function Avatar({ user, size = 40, className = "" }: { user: AvatarRef; size?: number; className?: string }) {
  return (
    // Image déjà redimensionnée (256 px) ou SVG : l'optimiseur de next/image n'apporte rien ici.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarSrc(user)}
      alt=""
      width={size}
      height={size}
      className={`shrink-0 rounded-full bg-pale object-cover ${className}`}
      style={{ width: size, height: size }}
      data-testid="avatar"
    />
  );
}
