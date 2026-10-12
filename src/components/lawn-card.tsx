import type { ReactNode } from "react";

/** Grande carte verte rayée (pages du visiteur non connecté). Le texte y est toujours blanc : seul le contraste blanc sur vert est garanti (AA). */
export function LawnCard({ children }: { children: ReactNode }) {
  return (
    <div data-bare>
      <div className="lawn mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col items-center justify-center gap-6 rounded-3xl px-8 py-12 text-center text-on-primary shadow-sm">
        {children}
      </div>
    </div>
  );
}

/** Logo « Ralli » en grand (Norican). Décoratif : le titre de la page est écrit à part. */
export function BigLogo({ size = "text-8xl" }: { size?: string }) {
  return (
    <p aria-hidden="true" className={`font-logo leading-none ${size}`}>
      Ralli
    </p>
  );
}

export const lawnButton = {
  solid: "inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-surface px-4 font-bold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
  outline:
    "inline-flex min-h-12 w-full items-center justify-center rounded-lg border-2 border-on-primary px-4 font-bold text-on-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
} as const;
