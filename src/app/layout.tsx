import type { Metadata } from "next";
import Link from "next/link";
import { DM_Sans, Fraunces, Geist } from "next/font/google";
import { Suspense } from "react";
import { AppNav } from "@/components/app-nav";
import { UserNav } from "@/components/user-nav";
import "./globals.css";

const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"] });
const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Ralli",
  description: "Pronostics entre amis sur les interclubs de tennis. Jeu gratuit, sans argent réel.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={`${dmSans.variable} ${fraunces.variable} ${geist.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <header className="bg-primary text-on-primary">
          <div className="mx-auto flex h-14 max-w-xl items-center justify-between px-4">
            <Link href="/" className="font-serif text-2xl font-bold">
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
      </body>
    </html>
  );
}
