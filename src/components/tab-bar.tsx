"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = "matchs" | "classement" | "portefeuille" | "club";

const ICONS: Record<Tab, React.ReactNode> = {
  matchs: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M4.5 8.5c4 1 7 4 8 8M19.5 15.5c-4-1-7-4-8-8" />
    </>
  ),
  classement: <path d="M5 20V11M12 20V4M19 20v-6" />,
  portefeuille: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="3" />
      <path d="M3 10h18M16 14.5h2" />
    </>
  ),
  club: (
    <>
      <circle cx="9" cy="9" r="3" />
      <path d="M3.5 19c.5-3 2.7-4.5 5.5-4.5s5 1.5 5.5 4.5M16 6.5a3 3 0 0 1 0 5.5M17.5 14.8c1.8.5 2.8 1.8 3 4.2" />
    </>
  ),
};

function activeTab(path: string): Tab | null {
  if (path === "/" || path.startsWith("/rencontres")) return "matchs";
  if (path.startsWith("/portefeuille")) return "portefeuille";
  if (path.endsWith("/classement") || path === "/classement") return "classement";
  if (path.startsWith("/clubs") || path.startsWith("/equipes")) return "club";
  return null;
}

/** Barre de navigation du bas, pour les comptes connectés. Les liens « Classement » et « Club » dépendent des clubs de l'utilisateur. */
export function TabBar({ hrefs }: { hrefs: Record<Tab, string> }) {
  const active = activeTab(usePathname());
  const items: [Tab, string][] = [
    ["matchs", "Matchs"],
    ["classement", "Classement"],
    ["portefeuille", "Portefeuille"],
    ["club", "Club"],
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
                className={`relative flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary ${
                  on ? "text-primary" : "text-ink-muted"
                }`}
              >
                {on && <span aria-hidden="true" className="absolute inset-x-[28%] top-0 h-[3px] rounded-b-sm bg-primary" />}
                <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6 fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  {ICONS[tab]}
                </svg>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
