import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role Supabase client — bypasses RLS. Use ONLY where there is no user
// session and the caller is already trusted, e.g. the Stripe webhook, which
// creates/deletes the agent mirror row after a verified payment event.
// Never import this into anything that runs with browser-supplied input.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Supabase service role is not configured (SUPABASE_SERVICE_ROLE_KEY)");
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
