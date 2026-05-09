import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/**
 * Server-side Supabase client using the service-role key. Never import this
 * from a Client Component — it must only be used inside route handlers, server
 * components, or other server-only modules.
 */
export function getServiceSupabase(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set on the server",
    );
  }

  cached = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}

/** Mint a signed download URL for a private bucket object. */
export async function signedDownloadUrl(
  fileKey: string,
  opts: { bucket?: string; expiresIn?: number } = {},
): Promise<string> {
  const { bucket = "uploads", expiresIn = 3600 } = opts;
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(fileKey, expiresIn);
  if (error || !data?.signedUrl) {
    throw new Error(`Could not sign URL for ${bucket}/${fileKey}: ${error?.message ?? "unknown"}`);
  }
  return data.signedUrl;
}

/** Mint a signed upload URL the browser can PUT directly into. */
export async function signedUploadUrl(
  fileKey: string,
  opts: { bucket?: string } = {},
): Promise<{ signedUrl: string; token: string; path: string }> {
  const { bucket = "uploads" } = opts;
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(fileKey);
  if (error || !data) {
    throw new Error(`Could not create signed upload URL for ${bucket}/${fileKey}: ${error?.message ?? "unknown"}`);
  }
  return data;
}
