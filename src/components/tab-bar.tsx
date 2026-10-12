"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = "matchs" | "rallis" | "classement" | "club";

const ICONS: Record<Tab, React.ReactNode> = {
  matchs: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M4.5 8.5c4 1 7 4 8 8M19.5 15.5c-4-1-7-4-8-8" />
    </>
  ),
  rallis: (
    <>
      <rect x="5" y="3.5" width="14" height="17" rx="2.5" />
      <path d="M8.5 9l1.8 1.8L14 7.5M8.5 15h7" />
    </>
  ),
  classement: <path d="M5 20V11M12 20V4M19 20v-6" />,
  club: (
    <>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.4" />
    </>
  ),
};

function activeTab(path: string): Tab | null {
  if (path === "/" || path.startsWith("/rencontres")) return "matchs";
  if (path.startsWith("/rallis")) return "rallis";
  if (path.endsWith("/classement") || path === "/classement") return "classement";
  if (path.startsWith("/clubs") || path.startsWith("/equipes")) return "club";
  return null;
}

/** Barre de navigation du bas, pour les comptes connectés. Le lien « Classement » dépend des clubs de l'utilisateur. */
export function TabBar({ hrefs, badges = {} }: { hrefs: Record<Tab, string>; badges?: Partial<Record<Tab, boolean>> }) {
  const active = activeTab(usePathname());
  const items: [Tab, string][] = [
    ["matchs", "Matchs"],
    ["rallis", "Mes rallis"],
    ["classement", "Classement"],
    ["club", "Clubs"],
  ];
  return (
    <nav aria-label="Navigation principale" className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid max-w-xl grid-cols-4">
        {items.map(([tab, label]) => {
          const on = active === tab;
          return (
            <li key={tab}>
              <Link
                href={hrefs[tab]}
                aria-current={on ? "page" : undefined}
                data-tour={tab}
                className={`relative flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary ${
                  on ? "text-primary" : "text-ink-muted"
                }`}
              >
                {on && <span aria-hidden="true" className="absolute inset-x-[28%] top-0 h-[3px] rounded-b-sm bg-primary" />}
                <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6 fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  {ICONS[tab]}
                </svg>
                {badges[tab] && (
                  <span
                    role="img"
                    aria-label="Nouveaux résultats"
                    data-testid={`badge-${tab}`}
                    className="absolute left-1/2 top-2.5 ml-2.5 size-2.5 rounded-full bg-clay ring-2 ring-surface"
                  />
                )}
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
