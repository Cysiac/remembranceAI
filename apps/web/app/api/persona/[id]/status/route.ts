import { NextResponse } from "next/server";

import { getServiceSupabase } from "@/lib/supabaseServer";
import { rowToPersona } from "@/lib/personaMapper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("personas")
    .select(
      "id, name, relationship, status, voice_id, agent_id, dataset_id, metadata, error_message, created_at",
    )
    .eq("id", params.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "db_read_failed", detail: error.message },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json({ error: "persona_not_found" }, { status: 404 });
  }

  return NextResponse.json(rowToPersona(data), {
    headers: { "cache-control": "no-store" },
  });
}
