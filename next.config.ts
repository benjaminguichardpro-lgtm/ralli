import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Développement uniquement : autorise un téléphone du réseau domestique (192.168.x.x) à ouvrir le serveur de dev du Mac.
  allowedDevOrigins: ["192.168.*.*"],
  cacheComponents: true,
  partialPrefetching: true,
  // Photos de profil : 5 Mo au maximum (src/lib/avatars.ts), plus la marge du format multipart.
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  // Affiche du tournoi en image : les polices (assets/fonts) sont lues sur le disque au démarrage de la route ; on les embarque explicitement.
  outputFileTracingIncludes: { "/tournois/[tournamentId]/affiche/image": ["./assets/fonts/**/*"] },
  // Anciennes adresses du Portefeuille et des Résultats, regroupés dans « Mes rallis » (les paramètres, comme ?statut=, sont conservés).
  // En-têtes de sécurité sur toutes les pages : pas d'affichage dans le cadre d'un autre site (clickjacking), pas de type de fichier
  // deviné, adresse complète jamais transmise aux sites externes, capteurs que l'app n'utilise pas désactivés.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: "/portefeuille", destination: "/rallis", permanent: false },
      { source: "/resultats", destination: "/rallis", permanent: false },
      // Le code d'invitation n'existe plus : les anciens liens et la page « Rejoindre par code » mènent à la recherche de clubs.
      { source: "/rejoindre/:code", destination: "/clubs/recherche", permanent: false },
      { source: "/clubs/rejoindre", destination: "/clubs/recherche", permanent: false },
    ];
  },
  turbopack: {
    // Un package-lock.json égaré dans le dossier personnel fausse la détection de la racine.
    root: path.join(__dirname),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
