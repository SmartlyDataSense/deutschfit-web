"use server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

export type ResetActionState =
  | { status: "idle" }
  | { status: "email_sent" }
  | { status: "error"; field: "email" | "server" };

export type UpdateActionState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; field: "password" | "confirm" | "token_expired" | "server" };

export async function requestReset(
  _prev: ResetActionState,
  formData: FormData
): Promise<ResetActionState> {
  const email = formData.get("email");
  const parsed = z.string().email().safeParse(email);
  if (!parsed.success) return { status: "error", field: "email" };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Anti-enumeration: always return email_sent regardless of Supabase result.
  // If env vars are missing on a misconfigured server, we still return email_sent
  // rather than leaking a server error that could reveal account existence.
  if (!url || !anonKey) return { status: "email_sent" };

  const sb = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Do NOT pass redirectTo — the Supabase Dashboard recovery template already
  // routes to /auth/confirm?token_hash=...&type=recovery.
  await sb.auth.resetPasswordForEmail(parsed.data);
  return { status: "email_sent" };
}

export async function verifyAndUpdate(
  _prev: UpdateActionState,
  formData: FormData
): Promise<UpdateActionState> {
  const token_hash = formData.get("token_hash");
  const password = formData.get("password");
  const confirm = formData.get("confirm");

  if (typeof token_hash !== "string" || !token_hash) return { status: "error", field: "server" };

  const pwParsed = z.string().min(8).safeParse(password);
  if (!pwParsed.success) return { status: "error", field: "password" };
  if (password !== confirm) return { status: "error", field: "confirm" };

  let sb;
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) return { status: "error", field: "server" };
    sb = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch {
    return { status: "error", field: "server" };
  }

  const { data, error } = await sb.auth.verifyOtp({ token_hash, type: "recovery" });
  // verifyOtp is single-use — if this fails (expired, already used, or network
  // error between verify and update), the token is gone. Direct user to restart.
  if (error || !data.user) return { status: "error", field: "token_expired" };

  const { error: updateError } = await sb.auth.admin.updateUserById(data.user.id, {
    password: pwParsed.data,
  });
  if (updateError) return { status: "error", field: "server" };

  return { status: "success" };
}
