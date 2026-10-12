import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Développement uniquement : autorise un téléphone du réseau domestique (192.168.x.x) à ouvrir le serveur de dev du Mac.
  allowedDevOrigins: ["192.168.*.*"],
  cacheComponents: true,
  partialPrefetching: true,
  // Photos de profil : 5 Mo au maximum (src/lib/avatars.ts), plus la marge du format multipart.
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  // Anciennes adresses du Portefeuille et des Résultats, regroupés dans « Mes rallis » (les paramètres, comme ?statut=, sont conservés).
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
