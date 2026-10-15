import type { ImportAction, ImportSummary } from "@/server/club-players";

// État de l'import des joueurs (dans un fichier à part : un fichier « use server » ne peut exporter que des fonctions).

export type ImportPreviewRow = { line: number; name: string; birth: string; rank: string; action: ImportAction; details: string[] };
export type ImportState = {
  message?: string;
  fatal?: string;
  /** Aperçu : les lignes à montrer (erreurs et changements d'abord) et les totaux. */
  preview?: { rows: ImportPreviewRow[]; hidden: number; summary: ImportSummary };
  /** Import terminé : totaux. */
  done?: ImportSummary;
};
export const initialImportState: ImportState = {};

