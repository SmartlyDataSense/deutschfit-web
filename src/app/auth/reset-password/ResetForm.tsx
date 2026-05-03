"use client";
import { useActionState } from "react";
import Link from "next/link";
import {
  requestReset,
  verifyAndUpdate,
  type ResetActionState,
  type UpdateActionState,
} from "./actions";

export function ResetForm({ token_hash }: { token_hash?: string }) {
  const [resetState, resetAction] = useActionState<ResetActionState, FormData>(requestReset, {
    status: "idle",
  });
  const [updateState, updateAction] = useActionState<UpdateActionState, FormData>(verifyAndUpdate, {
    status: "idle",
  });

  if (token_hash) {
    if (updateState.status === "success") {
      return (
        <p className="mt-4 font-sans text-[16px] leading-[1.5] text-text-secondary">
          Mot de passe mis à jour. Retournez dans DeutschFit et connectez-vous.
        </p>
      );
    }
    return (
      <form action={updateAction} className="mt-8 flex flex-col gap-4">
        <input type="hidden" name="token_hash" value={token_hash} />
        {updateState.status === "error" && updateState.field === "token_expired" && (
          <p className="text-[14px] text-error-red">
            Ce lien a expiré.{" "}
            <Link href="/auth/reset-password" className="underline">
              Recommencer
            </Link>
            .
          </p>
        )}
        {updateState.status === "error" && updateState.field === "server" && (
          <p className="text-[14px] text-error-red">Erreur serveur. Veuillez réessayer.</p>
        )}
        <input
          type="password"
          name="password"
          placeholder="Nouveau mot de passe (8 caractères min.)"
          required
          minLength={8}
          className="rounded-md border border-border px-4 py-3 font-sans text-[16px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-cta"
        />
        {updateState.status === "error" && updateState.field === "password" && (
          <p className="text-[14px] text-error-red">8 caractères minimum.</p>
        )}
        <input
          type="password"
          name="confirm"
          placeholder="Confirmer le mot de passe"
          required
          className="rounded-md border border-border px-4 py-3 font-sans text-[16px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-cta"
        />
        {updateState.status === "error" && updateState.field === "confirm" && (
          <p className="text-[14px] text-error-red">Les mots de passe ne correspondent pas.</p>
        )}
        <button
          type="submit"
          className="mt-2 inline-flex items-center justify-center rounded-md bg-cta px-5 py-2.5 font-sans text-[16px] font-semibold text-cta-ink hover:opacity-90"
        >
          Mettre à jour
        </button>
      </form>
    );
  }

  if (resetState.status === "email_sent") {
    return (
      <p className="mt-4 font-sans text-[16px] leading-[1.5] text-text-secondary">
        Si un compte existe pour cette adresse, vous recevrez un email dans quelques instants.
      </p>
    );
  }

  return (
    <form action={resetAction} className="mt-8 flex flex-col gap-4">
      {resetState.status === "error" && (
        <p className="text-[14px] text-error-red">
          {resetState.field === "email"
            ? "Adresse email invalide."
            : "Erreur serveur. Veuillez réessayer."}
        </p>
      )}
      <input
        type="email"
        name="email"
        placeholder="Votre adresse email"
        required
        autoComplete="email"
        className="rounded-md border border-border px-4 py-3 font-sans text-[16px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-cta"
      />
      <button
        type="submit"
        className="mt-2 inline-flex items-center justify-center rounded-md bg-cta px-5 py-2.5 font-sans text-[16px] font-semibold text-cta-ink hover:opacity-90"
      >
        Envoyer le lien
      </button>
    </form>
  );
}
