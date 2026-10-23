"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";
import { requireUser } from "@/lib/auth/current-user";
import { afterAuthPath } from "@/lib/clubs/invite-link";
import { changePasswordSchema, fieldErrors, signInSchema, signUpFormSchema } from "@/lib/validation/account";
import { changePassword, registerUser } from "@/server/accounts";
import { DomainError } from "@/server/errors";
import { clientIp, loginWaitMs, recordSignup, signupWaitMs, tooManyAttemptsMessage } from "@/server/rate-limit";
import type { FormState } from "./types";

function str(fd: FormData, key: string): string | undefined {
  const v = fd.get(key);
  return typeof v === "string" ? v : undefined;
}

export async function signUpAction(_: FormState, fd: FormData): Promise<FormState> {
  const raw = {
    email: str(fd, "email"),
    displayName: str(fd, "displayName"),
    password: str(fd, "password"),
    confirm: str(fd, "confirm"),
  };
  const values = { email: raw.email ?? "", displayName: raw.displayName ?? "" };
  const parsed = signUpFormSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const ip = clientIp(await headers());
  const wait = await signupWaitMs(ip);
  if (wait > 0) return { errors: { _: tooManyAttemptsMessage(wait) }, values };
  await recordSignup(ip);

  try {
    await registerUser(parsed.data);
  } catch (e) {
    if (e instanceof DomainError) {
      const field = e.code === "EMAIL_TAKEN" ? "email" : e.code === "DISPLAY_NAME_TAKEN" ? "displayName" : "_";
      return { errors: { [field]: e.message }, values };
    }
    throw e;
  }
  // Connexion immédiate après inscription ; signIn redirige (exception de contrôle à laisser passer).
  await signIn("credentials", { identifier: parsed.data.email, password: parsed.data.password, redirectTo: afterAuthPath(str(fd, "club")) });
  return {};
}

export async function signInAction(_: FormState, fd: FormData): Promise<FormState> {
  const raw = { identifier: str(fd, "identifier"), password: str(fd, "password") };
  const values = { identifier: raw.identifier ?? "" };
  const parsed = signInSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  // Même contrôle que dans Auth.js (qui reste le vrai verrou) : ici, il sert à afficher le délai d'attente.
  const wait = await loginWaitMs(parsed.data.identifier, clientIp(await headers()));
  if (wait > 0) return { message: tooManyAttemptsMessage(wait), values };
  try {
    await signIn("credentials", { ...parsed.data, redirectTo: afterAuthPath(str(fd, "club")) });
  } catch (e) {
    if (e instanceof AuthError) return { message: "Email, pseudo ou mot de passe incorrect", values };
    throw e;
  }
  return {};
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}

export async function changePasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser({ allowPendingPasswordChange: true });
  const parsed = changePasswordSchema.safeParse({ password: str(fd, "password"), confirm: str(fd, "confirm") });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  await changePassword(user.id, parsed.data.password);
  // L'en-tête et la barre du bas (solde, onglets) sont masqués tant que le mot de passe est temporaire : on les recharge.
  revalidatePath("/", "layout");
  redirect("/");
}
