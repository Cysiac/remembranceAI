import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/**
 * Browser Supabase client (anon key). Used for direct PUTs to signed upload
 * URLs. Never import the service-role client (`@/lib/supabaseServer`) from
 * Client Components — it leaks the service-role key into the bundle.
 */
export function getBrowserSupabase(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set",
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false },
  });
  return cached;
}
