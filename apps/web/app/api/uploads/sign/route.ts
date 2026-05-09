/**
 * Mints a signed upload URL for a single file under the `uploads` bucket.
 * The browser then PUTs the file directly to Supabase Storage.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";

import { signedUploadUrl } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  filename: z.string().min(1).max(200),
  contentType: z.string().min(1).max(120).optional(),
  prefix: z.string().min(1).max(120).optional(),
});

export async function POST(req: Request): Promise<Response> {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { filename, prefix } = parsed.data;
  const safeName = filename.replace(/[^A-Za-z0-9._-]/g, "_");
  const key = `${prefix ?? "uploads"}/${randomUUID()}-${safeName}`;

  try {
    const signed = await signedUploadUrl(key);
    return NextResponse.json({
      file_key: signed.path,
      signed_url: signed.signedUrl,
      token: signed.token,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "sign_failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
