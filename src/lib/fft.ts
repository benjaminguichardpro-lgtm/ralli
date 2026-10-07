import type { FftRank } from "@/generated/prisma/enums";

// Échelle FFT, du plus faible au plus fort, avec le libellé affiché.
// L'ordre sert aussi au modèle de cotes (tranche 4), qui y associera un rating.
export const FFT_RANKS: readonly { value: FftRank; label: string }[] = [
  { value: "NC", label: "NC" },
  { value: "R40", label: "40" },
  { value: "R30_5", label: "30/5" },
  { value: "R30_4", label: "30/4" },
  { value: "R30_3", label: "30/3" },
  { value: "R30_2", label: "30/2" },
  { value: "R30_1", label: "30/1" },
  { value: "R30", label: "30" },
  { value: "R15_5", label: "15/5" },
  { value: "R15_4", label: "15/4" },
  { value: "R15_3", label: "15/3" },
  { value: "R15_2", label: "15/2" },
  { value: "R15_1", label: "15/1" },
  { value: "R15", label: "15" },
  { value: "R5_6", label: "5/6" },
  { value: "R4_6", label: "4/6" },
  { value: "R3_6", label: "3/6" },
  { value: "R2_6", label: "2/6" },
  { value: "R1_6", label: "1/6" },
  { value: "R0", label: "0" },
  { value: "RM2_6", label: "-2/6" },
  { value: "RM4_6", label: "-4/6" },
  { value: "RM15", label: "-15" },
  { value: "RM30", label: "-30" },
  { value: "PREMIERE_SERIE", label: "1re série" },
];

const LABELS = new Map(FFT_RANKS.map((r) => [r.value, r.label]));

export function fftLabel(rank: FftRank): string {
  return LABELS.get(rank) ?? rank;
}

/** Index dans l'échelle (0 = NC). */
export function fftIndex(rank: FftRank): number {
  return FFT_RANKS.findIndex((r) => r.value === rank);
}
