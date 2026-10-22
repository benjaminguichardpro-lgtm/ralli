"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth/current-user";
import { DomainError } from "@/server/errors";
import { setMyPostalCode, setMyRadius } from "@/server/nearby";
import type { FormState } from "./types";

/** Enregistre (ou efface, champ vide) le code postal du compte. Sert au profil et à la fenêtre « Où es-tu ? ». */
export async function savePostalCodeAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const values = { postalCode: String(fd.get("postalCode") ?? "") };
  let commune: string | null;
  try {
    ({ commune } = await setMyPostalCode(user.id, values.postalCode));
  } catch (e) {
    if (e instanceof DomainError) return { message: e.message, errors: { postalCode: e.message }, values };
    throw e;
  }
  // Pas de refresh() ici : sur l'accueil, la page repasserait le bouton en simple lien et ferait disparaître la fenêtre
  // « Où es-tu ? » avant qu'elle n'ouvre les résultats. Le formulaire rafraîchit la page lui-même (ou navigue, dans la fenêtre).
  return { ok: true, message: commune ? `Enregistré : ${commune}.` : "Code postal effacé.", values: { ...values, commune: commune ?? "" } };
}

export async function saveRadiusAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const values = { radius: String(fd.get("radius") ?? "") };
  const kind = fd.get("kind") === "tournois" ? "tournois" : "interclubs";
  try {
    await setMyRadius(user.id, values.radius, kind);
  } catch (e) {
    if (e instanceof DomainError) return { message: e.message, errors: { radius: e.message }, values };
    throw e;
  }
  refresh();
  return { ok: true, message: "Distance enregistrée.", values };
}
