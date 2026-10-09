import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Développement uniquement : autorise un téléphone du réseau domestique (192.168.x.x) à ouvrir le serveur de dev du Mac.
  allowedDevOrigins: ["192.168.*.*"],
  cacheComponents: true,
  partialPrefetching: true,
  // Photos de profil : 5 Mo au maximum (src/lib/avatars.ts), plus la marge du format multipart.
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
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
