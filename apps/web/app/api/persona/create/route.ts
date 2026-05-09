import { NextResponse } from "next/server";
import { z } from "zod";

import type { CreatePersonaResponse } from "@shared/types";
import { getServiceSupabase } from "@/lib/supabaseServer";
import { kickWorkerJob } from "@/lib/workerClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  name: z.string().min(1).max(120),
  relationship: z.string().min(1).max(120),
  uploadedFileKeys: z.array(z.string().min(1)).min(1).max(100),
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
  const { name, relationship, uploadedFileKeys } = parsed.data;

  const supabase = getServiceSupabase();
  const { data: row, error: insertError } = await supabase
    .from("personas")
    .insert({
      name,
      relationship,
      status: "uploading",
      metadata: { catchphrases: [], memoryAnchors: [] },
    })
    .select("id")
    .single();

  if (insertError || !row) {
    return NextResponse.json(
      { error: "db_insert_failed", detail: insertError?.message },
      { status: 500 },
    );
  }

  try {
    await kickWorkerJob({ persona_id: row.id, file_keys: uploadedFileKeys });
  } catch (err) {
    await supabase
      .from("personas")
      .update({
        status: "error",
        error_message: err instanceof Error ? err.message.slice(0, 500) : "worker kickoff failed",
      })
      .eq("id", row.id);
    return NextResponse.json(
      {
        error: "worker_unreachable",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }

  const body: CreatePersonaResponse = { persona_id: row.id };
  return NextResponse.json(body, { status: 201 });
}
