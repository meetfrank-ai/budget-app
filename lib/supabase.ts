import { createClient } from "@supabase/supabase-js";

// Server-only client — uses service role, bypasses RLS.
// Single-user mode: every query passes SUPABASE_USER_ID explicitly.
export function supabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

export const USER_ID = process.env.SUPABASE_USER_ID!;
