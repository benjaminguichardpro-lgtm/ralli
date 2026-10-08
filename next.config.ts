import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Développement uniquement : autorise un téléphone du réseau domestique (192.168.x.x) à ouvrir le serveur de dev du Mac.
  allowedDevOrigins: ["192.168.*.*"],
  cacheComponents: true,
  partialPrefetching: true,
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
