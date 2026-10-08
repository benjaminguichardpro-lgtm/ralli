import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Une seule instance par process (évite d'épuiser les connexions avec le hot reload en dev).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL manquante (voir .env.example)");
  // Bases locales (`prisma dev`) : une seule connexion, car ce serveur embarqué se mélange les pinceaux quand
  // plusieurs requêtes arrivent en même temps (« bind message supplies N parameters »). Inutile sur Neon : laisser vide.
  const max = Number(process.env.DATABASE_POOL_MAX) || undefined;
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max }) });
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
