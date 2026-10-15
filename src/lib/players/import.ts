import type { FftRank } from "@/generated/prisma/enums";
import { playerInputSchema } from "@/lib/validation/team";
import { parseBirthDate } from "./birth";
import { parseFftRank } from "./rank";

// Import en lot des joueurs d'un club : lecture d'un tableau (CSV ou Excel déjà converti en lignes de cellules), repérage des colonnes par leur titre,
// nettoyage et contrôle de chaque ligne. Fonctions pures : la base n'est pas touchée ici.

export const MAX_IMPORT_ROWS = 10_000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export type ImportRow = {
  /** Numéro de ligne dans le fichier (1 = première ligne, titres compris), pour que l'admin retrouve l'erreur. */
  line: number;
  firstName: string;
  lastName: string;
  birthDate: Date | null;
  fftRank: FftRank;
  errors: string[];
  /** Remarques non bloquantes : classement absent (NC), année seule… */
  notes: string[];
};

export type ParsedImport = { rows: ImportRow[]; fatal: string | null };

const key = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const COLUMNS = {
  lastName: ["nom", "nom de famille", "name", "last name", "lastname", "family name"],
  firstName: ["prenom", "first name", "firstname", "given name"],
  birthDate: ["date de naissance", "date naissance", "naissance", "ne le", "nee le", "ne e le", "birth", "birthdate", "birth date", "date of birth", "dob"],
  fftRank: ["classement", "classement fft", "niveau", "niveau fft", "rang", "rank", "ranking"],
} as const;
type Field = keyof typeof COLUMNS;

/** « DUPONT » → « Dupont », « JEAN-PIERRE » → « Jean-Pierre » (les exports FFT écrivent les noms en capitales) ; le reste est laissé tel quel. */
export function tidyName(raw: string): string {
  const s = raw.trim().replace(/\s+/g, " ");
  if (s.length > 1 && s === s.toUpperCase() && s !== s.toLowerCase()) {
    return s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, c: string) => sep + c.toUpperCase());
  }
  return s;
}

/** Sépare, nettoie et contrôle les lignes d'un tableau. La première ligne qui contient « nom » et « prénom » sert de titres. */
export function normalizeSheet(data: readonly (readonly unknown[])[], now = new Date()): ParsedImport {
  const headerIndex = data.findIndex((row) => {
    const keys = row.map(key);
    return keys.some((k) => (COLUMNS.lastName as readonly string[]).includes(k)) && keys.some((k) => (COLUMNS.firstName as readonly string[]).includes(k));
  });
  if (headerIndex < 0) return { rows: [], fatal: "Titres de colonnes introuvables : le fichier doit avoir au moins les colonnes « Nom » et « Prénom » (voir le modèle)." };
  const keys = data[headerIndex]!.map(key);
  const col = {} as Record<Field, number>;
  for (const field of Object.keys(COLUMNS) as Field[]) col[field] = keys.findIndex((k) => (COLUMNS[field] as readonly string[]).includes(k));

  const body = data.slice(headerIndex + 1).map((cells, i) => ({ cells, line: headerIndex + 2 + i }));
  const rows: ImportRow[] = [];
  for (const { cells, line } of body) {
    if (cells.every((c) => c === null || c === undefined || String(c).trim() === "")) continue; // ligne vide
    if (rows.length >= MAX_IMPORT_ROWS) return { rows: [], fatal: `Trop de lignes : ${MAX_IMPORT_ROWS.toLocaleString("fr-FR")} joueurs au maximum par fichier.` };
    const cell = (f: Field) => (col[f] >= 0 ? cells[col[f]] : undefined);
    const errors: string[] = [];
    const notes: string[] = [];

    const rawRank = cell("fftRank");
    const rankEmpty = rawRank === null || rawRank === undefined || String(rawRank).trim() === "";
    let fftRank: FftRank = "NC";
    if (rankEmpty) notes.push("Classement absent : NC");
    else {
      const r = parseFftRank(rawRank);
      if (r) {
        fftRank = r;
        // Un classement saisi comme nombre peut avoir été déformé par le tableur (« 30/2 » devient 15 : une division) : on prévient.
        if (typeof rawRank === "number") notes.push(`Classement lu comme un nombre (${rawRank}) : vérifie-le, un tableur transforme parfois « 30/2 » en 15`);
      }
      else errors.push(`Classement inconnu : « ${String(rawRank).trim()} »`);
    }

    let birthDate: Date | null = null;
    const b = parseBirthDate(cell("birthDate"), now);
    if ("error" in b) errors.push(b.error);
    else {
      birthDate = b.date;
      if (b.yearOnly) notes.push("Année seule : 1er janvier");
    }

    const first = tidyName(String(cell("firstName") ?? ""));
    const last = tidyName(String(cell("lastName") ?? ""));
    const person = playerInputSchema.safeParse({ firstName: first, lastName: last, fftRank });
    let firstName = first;
    let lastName = last;
    if (person.success) {
      firstName = person.data.firstName;
      lastName = person.data.lastName;
    } else {
      for (const issue of person.error.issues) {
        if (issue.path[0] === "firstName") errors.push(`Prénom : ${issue.message}`);
        else if (issue.path[0] === "lastName") errors.push(`Nom : ${issue.message}`);
      }
    }
    rows.push({ line, firstName, lastName, birthDate, fftRank, errors, notes });
  }
  if (rows.length === 0) return { rows: [], fatal: "Le fichier ne contient aucun joueur." };
  return { rows, fatal: null };
}

/** Contenu du modèle à télécharger : CSV avec « ; » (s'ouvre correctement dans Excel français), BOM UTF-8 pour les accents. */
export const IMPORT_TEMPLATE =
  "﻿Nom;Prénom;Date de naissance;Classement\r\nDupont;Camille;14/03/1987;30/2\r\nMartin;Léa;02/11/1995;NC\r\nBernard;Thomas;21/07/1979;15/4\r\n";
