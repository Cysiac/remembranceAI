import { NextResponse } from "next/server";

import type { Persona } from "@shared/types";
import { getServiceSupabase } from "@/lib/supabaseServer";
import { rowToPersona } from "@/lib/personaMapper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
): Promise<Response> {
  const demoPersona = maybeDemoPersona(req, params.id);
  if (demoPersona) {
    return NextResponse.json(demoPersona, {
      headers: { "cache-control": "no-store" },
    });
  }

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

  const persona = rowToPersona(data);
  return NextResponse.json(persona, {
    headers: { "cache-control": "no-store, max-age=0" },
  });
}

function maybeDemoPersona(req: Request, id: string): Persona | null {
  const url = new URL(req.url);
  if (url.searchParams.get("demo") !== "1") return null;

  const voiceId = process.env.DEMO_VOICE_ID;
  const agentId = process.env.DEMO_AGENT_ID;
  if (!voiceId || !agentId) return null;

  return {
    id,
    name: "Grandma",
    relationship: "grandmother",
    status: "ready",
    voice_id: voiceId,
    agent_id: agentId,
    metadata: {
      catchphrases: ["come here, sweetheart", "put the kettle on"],
      memoryAnchors: [
        {
          title: "The lake house",
          people: ["Grandma", "family"],
          description:
            "Summer afternoons at the lake house, with stories over tea.",
        },
      ],
      eraTags: ["demo"],
      firstMessage: "Hi sweetheart — it's Grandma. I'm so glad you came by.",
      toneSummary: "warm, gentle, nostalgic",
    },
    createdAt: new Date(0).toISOString(),
  };
}
