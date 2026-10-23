import { createHmac } from "node:crypto";
import { db } from "@/lib/db";

// Limite d'essais à la connexion et à l'inscription. Les essais sont rangés dans AuthAttempt, avec une empreinte (jamais la valeur elle-même).
//
// - Connexion, par pseudo ou email (même s'il n'existe pas : on ne révèle rien) : blocage progressif.
// - Connexion, par adresse IP : une IP qui multiplie les échecs sur des comptes différents est bloquée aussi.
// - Inscription, par adresse IP.
// Sans adresse IP exploitable (adresse absente ou locale : `next start` sur le Mac, tests), les limites par IP sont ignorées ;
// sur Vercel l'adresse du visiteur est toujours fournie.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

type Tier = { failures: number; windowMs: number };
/** Échecs tolérés avant blocage, pour une même fenêtre de temps : le blocage dure aussi longtemps que la fenêtre. */
const LOGIN_TIERS: readonly Tier[] = [
  { failures: 5, windowMs: 15 * MINUTE },
  { failures: 10, windowMs: HOUR },
  { failures: 20, windowMs: 24 * HOUR },
];
const LOGIN_IP_TIER: Tier = { failures: 20, windowMs: 15 * MINUTE };
const SIGNUP_IP_TIER: Tier = { failures: 5, windowMs: HOUR };
const RETENTION_MS = 24 * HOUR;

type Scope = "login" | "login-ip" | "signup";

const keyHash = (scope: Scope, value: string) =>
  createHmac("sha256", process.env.AUTH_SECRET ?? "ralli").update(`${scope}:${value.trim().toLowerCase()}`).digest("hex");

const LOOPBACK = /^(::1|127\.\d+\.\d+\.\d+|::ffff:127\.\d+\.\d+\.\d+)$/;

/** Adresse IP du visiteur (première adresse de x-forwarded-for, posée par Vercel), ou null si inconnue ou locale (la machine elle-même). */
export function clientIp(headers: Headers): string | null {
  const ip = headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim() || null;
  return ip && !LOOPBACK.test(ip) ? ip : null;
}

/** Millisecondes à attendre avant de pouvoir réessayer (0 : autorisé). */
async function waitMs(scope: Scope, value: string, tiers: readonly Tier[], now: Date): Promise<number> {
  const hash = keyHash(scope, value);
  const widest = Math.max(...tiers.map((t) => t.windowMs));
  const rows = await db.authAttempt.findMany({
    where: { scope, keyHash: hash, createdAt: { gt: new Date(now.getTime() - widest) } },
    select: { createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  let wait = 0;
  for (const t of tiers) {
    const inWindow = rows.filter((r) => r.createdAt.getTime() > now.getTime() - t.windowMs);
    if (inWindow.length >= t.failures) wait = Math.max(wait, inWindow[0]!.createdAt.getTime() + t.windowMs - now.getTime());
  }
  return Math.max(0, wait);
}

async function record(scope: Scope, value: string, now: Date): Promise<void> {
  await db.authAttempt.create({ data: { scope, keyHash: keyHash(scope, value), createdAt: now } });
  await db.authAttempt.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - RETENTION_MS) } } });
}

/** Message à montrer quand une limite est atteinte. */
export function tooManyAttemptsMessage(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / MINUTE));
  return minutes >= 120
    ? "Trop d'essais. Réessaie plus tard."
    : `Trop d'essais. Réessaie dans ${minutes >= 60 ? `${Math.ceil(minutes / 60)} h` : `${minutes} minute${minutes > 1 ? "s" : ""}`}.`;
}

/** Temps d'attente imposé à cette connexion (0 : autorisée), selon le pseudo ou l'email tapé et l'adresse IP. */
export async function loginWaitMs(identifier: string, ip: string | null, now = new Date()): Promise<number> {
  const [byName, byIp] = await Promise.all([waitMs("login", identifier, LOGIN_TIERS, now), ip ? waitMs("login-ip", ip, [LOGIN_IP_TIER], now) : 0]);
  return Math.max(byName, byIp);
}

export async function recordLoginFailure(identifier: string, ip: string | null, now = new Date()): Promise<void> {
  await record("login", identifier, now);
  if (ip) await record("login-ip", ip, now);
}

/** Connexion réussie : les échecs de ce pseudo ou email sont oubliés (ceux de l'adresse IP restent). */
export async function clearLoginFailures(identifier: string): Promise<void> {
  await db.authAttempt.deleteMany({ where: { scope: "login", keyHash: keyHash("login", identifier) } });
}

/** Temps d'attente imposé à une inscription depuis cette adresse IP (0 : autorisée). */
export async function signupWaitMs(ip: string | null, now = new Date()): Promise<number> {
  return ip ? waitMs("signup", ip, [SIGNUP_IP_TIER], now) : 0;
}

export async function recordSignup(ip: string | null, now = new Date()): Promise<void> {
  if (ip) await record("signup", ip, now);
}
