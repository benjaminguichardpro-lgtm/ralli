import type { FftRank } from "@/generated/prisma/enums";
import { FFT_RANKS } from "@/lib/fft";

// Lecture d'un classement FFT écrit « à la main » (fichier d'import) : NC, 40, 30/5, 30.1, 15, 5/6, -2/6, -15, 1re série… Fonctions pures.

const strip = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\s_]+/g, " ")
    .trim();

/** « 30/5 », « 30.5 », « 30-5 », « 30 / 5 » → R30_5 ; null si le classement est inconnu. */
export function parseFftRank(raw: unknown): FftRank | null {
  if (raw instanceof Date) raw = `${raw.getUTCDate()}/${raw.getUTCMonth() + 1}`; // Excel transforme « 30/5 » en date (30 mai) : on relit jour/mois
  if (typeof raw === "number") raw = String(raw); // une cellule Excel « 30 » est un nombre (« 30.5 » aussi)
  if (typeof raw !== "string") return null;
  let s = strip(raw).replace(/[\u2212\u2013\u2014]/g, "-").replace(/^classement\s*:?\s*/, "");
  if (s === "") return null;
  if (/^n\.?\s?c\.?$/.test(s) || s === "non classe" || s === "non classee") return "NC";
  if (/^(1|1re|1ere|premiere|prem\.?)(\s*serie)?$/.test(s) && /serie|prem/.test(s)) return "PREMIERE_SERIE";
  if (/^serie\s*1$/.test(s)) return "PREMIERE_SERIE";
  s = s.replace(/\s*([/.\-])\s*/g, "$1").replace(/,/g, ".");
  // « 30/5 », « 30.5 », « 30-5 » (30 et 15 : six échelons) ; « 5/6 », « 4/6 »… « -2/6 », « -4/6 » (échelons de 6).
  let m = /^(30|15)[/.\-]([1-5])$/.exec(s);
  if (m) return `R${m[1]}_${m[2]}` as FftRank;
  m = /^(-?[0-5])[/.\-]6$/.exec(s);
  if (m) {
    const n = Number(m[1]);
    const key = n < 0 ? `RM${-n}_6` : n === 0 ? "R0" : `R${n}_6`;
    const found = FFT_RANKS.find((r) => r.value === key);
    return found ? found.value : null;
  }
  if (s === "40") return "R40";
  if (s === "30") return "R30";
  if (s === "15") return "R15";
  if (s === "0") return "R0";
  if (s === "-15") return "RM15";
  if (s === "-30") return "RM30";
  return null;
}
