import type { Persona, PersonaStatus } from "@shared/types";

interface PersonaRow {
  id: string;
  name: string;
  relationship: string;
  status: string;
  voice_id: string | null;
  agent_id: string | null;
  dataset_id: string | null;
  metadata: unknown;
  error_message: string | null;
  created_at: string;
}

const VALID_STATUSES: ReadonlyArray<PersonaStatus> = [
  "uploading",
  "cleaning",
  "cloning_voice",
  "building_agent",
  "ready",
  "error",
];

export function rowToPersona(row: PersonaRow): Persona {
  const status: PersonaStatus = VALID_STATUSES.includes(row.status as PersonaStatus)
    ? (row.status as PersonaStatus)
    : "error";

  const meta = (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<
    string,
    unknown
  >;

  return {
    id: row.id,
    name: row.name,
    relationship: row.relationship,
    status,
    voice_id: row.voice_id ?? undefined,
    agent_id: row.agent_id ?? undefined,
    dataset_id: row.dataset_id ?? undefined,
    metadata: {
      catchphrases: Array.isArray(meta.catchphrases) ? (meta.catchphrases as string[]) : [],
      memoryAnchors: Array.isArray(meta.memoryAnchors)
        ? (meta.memoryAnchors as Persona["metadata"]["memoryAnchors"])
        : [],
      eraTags: Array.isArray(meta.eraTags) ? (meta.eraTags as string[]) : undefined,
    },
    errorMessage: row.error_message ?? undefined,
    createdAt: row.created_at,
  };
}
