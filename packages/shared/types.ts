// Shared contract between FE and BE. DO NOT modify without explicit agreement
// from both owners (see AGENTS.md).

export type PersonaStatus =
  | "uploading"
  | "cleaning"
  | "cloning_voice"
  | "building_agent"
  | "ready"
  | "error";

export interface MemoryAnchor {
  title: string;
  date?: string;
  people: string[];
  description: string;
}

export interface PersonaMetadata {
  catchphrases: string[];
  memoryAnchors: MemoryAnchor[];
  eraTags?: string[];
  /** Server-side only fields — do not show in the FE UI. */
  systemPrompt?: string;
  firstMessage?: string;
  toneSummary?: string;
}

export interface Persona {
  id: string;
  name: string;
  relationship: string;
  status: PersonaStatus;
  voice_id?: string;
  agent_id?: string;
  dataset_id?: string;
  metadata: PersonaMetadata;
  errorMessage?: string;
  createdAt: string;
}

export interface CreatePersonaRequest {
  name: string;
  relationship: string;
  uploadedFileKeys: string[];
}

export interface CreatePersonaResponse {
  persona_id: string;
}

export interface GenerateVideoRequest {
  persona_id: string;
  scene: string;
  reference_photo_key: string;
}

export interface GenerateVideoResponse {
  video_url: string;
}

// Worker-internal request body (BE-only; never called from the browser)
export interface WorkerJobRequest {
  persona_id: string;
  file_keys: string[];
}
