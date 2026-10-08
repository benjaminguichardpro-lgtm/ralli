import type { Metadata } from "next";
import Link from "next/link";
import { Cormorant_Garamond, DM_Sans, Norican } from "next/font/google";
import { Suspense } from "react";
import { AppNav } from "@/components/app-nav";
import { DailyBonus } from "@/components/daily-bonus";
import { UserNav } from "@/components/user-nav";
import "./globals.css";

// Seules les graisses utilisées sont chargées (un texte demandé en 600 avec DM Sans s'affiche en 700).
const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"], weight: ["400", "500", "700"] });
const cormorant = Cormorant_Garamond({ variable: "--font-cormorant", subsets: ["latin"], weight: ["600", "700"] });
const norican = Norican({ variable: "--font-norican", subsets: ["latin"], weight: "400" });

export const metadata: Metadata = {
  title: "Ralli",
  description: "Pronostics entre amis sur les interclubs de tennis. Jeu gratuit, sans argent réel.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={`${dmSans.variable} ${cormorant.variable} ${norican.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <header className="bg-brand text-on-primary">
          <div className="mx-auto flex h-14 max-w-xl items-center justify-between px-4">
            <Link href="/" className="font-logo text-3xl leading-none">
              Ralli
            </Link>
            <Suspense fallback={null}>
              <UserNav />
            </Suspense>
          </div>
        </header>
        <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">{children}</main>
        <footer className="px-4 pb-24 pt-6 text-center text-sm text-ink-muted">
          Jeu gratuit, sans argent réel, réservé aux 18 ans et plus.
        </footer>
        <Suspense fallback={null}>
          <AppNav />
        </Suspense>
        <Suspense fallback={null}>
          <DailyBonus />
        </Suspense>
      </body>
    </html>
  );
}
