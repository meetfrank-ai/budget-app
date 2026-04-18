import { createClient } from "@supabase/supabase-js";

// Server-only client — uses service role, bypasses RLS.
// Single-user mode: every query passes SUPABASE_USER_ID explicitly.
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function supabaseServer() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url) throw new Error("Missing required env var: SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
  return createClient(url, key, { auth: { persistSession: false } });
}

export const USER_ID = requireEnv("SUPABASE_USER_ID");
