/**
 * Browser-side helper that uploads a single file directly to Supabase Storage
 * via a signed PUT URL minted by /api/uploads/sign.
 */

import { getBrowserSupabase } from "@/lib/supabase";

export interface SignedUpload {
  file_key: string;
  signed_url: string;
  token: string;
}

export async function requestSignedUpload(
  filename: string,
  contentType: string,
): Promise<SignedUpload> {
  const res = await fetch("/api/uploads/sign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ filename, contentType, prefix: "uploads" }),
  });
  if (!res.ok) {
    const detail = await safeText(res);
    throw new Error(`sign upload failed (${res.status}): ${detail}`);
  }
  const body = (await res.json()) as SignedUpload;
  if (!body.file_key || !body.token) {
    throw new Error("sign upload response missing fields");
  }
  return body;
}

export async function uploadFile(file: File): Promise<string> {
  const signed = await requestSignedUpload(
    file.name,
    file.type || "application/octet-stream",
  );

  const supabase = getBrowserSupabase();
  const { error } = await supabase.storage
    .from("uploads")
    .uploadToSignedUrl(signed.file_key, signed.token, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (error) {
    throw new Error(`upload failed: ${error.message}`);
  }
  return signed.file_key;
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "";
  }
}
