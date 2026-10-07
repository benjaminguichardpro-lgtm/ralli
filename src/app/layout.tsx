import type { Metadata } from "next";
import Link from "next/link";
import { Inter, Playfair_Display } from "next/font/google";
import { Suspense } from "react";
import { UserNav } from "@/components/user-nav";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const playfair = Playfair_Display({ variable: "--font-playfair", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Ralli",
  description: "Pronostics entre amis sur les interclubs de tennis. Jeu gratuit, sans argent réel.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={`${inter.variable} ${playfair.variable} h-full antialiased`}>
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
        <footer className="px-4 py-6 text-center text-sm text-ink-muted">
          Jeu gratuit, sans argent réel, réservé aux 18 ans et plus.
        </footer>
      </body>
    </html>
  );
}
