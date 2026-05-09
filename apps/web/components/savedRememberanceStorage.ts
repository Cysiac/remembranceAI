export const SAVED_REMEMBERANCES_STORAGE_KEY =
  "rememberanceAI:savedRememberances";

const MAX_SAVED_REMEMBERANCES = 12;

export interface SavedRememberance {
  personaId: string;
  name: string;
  relationship: string;
  createdAt: string;
  updatedAt: string;
  note?: string;
}

export function readSavedRememberances(): SavedRememberance[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(SAVED_REMEMBERANCES_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(isSavedRememberance);
  } catch {
    return [];
  }
}

export function saveRememberanceSummary(
  entry: Omit<SavedRememberance, "createdAt" | "updatedAt"> & {
    createdAt?: string;
    updatedAt?: string;
  },
): void {
  if (typeof window === "undefined") return;

  const now = new Date().toISOString();
  const normalized: SavedRememberance = {
    personaId: entry.personaId,
    name: entry.name,
    relationship: entry.relationship,
    note: entry.note,
    createdAt: entry.createdAt ?? now,
    updatedAt: entry.updatedAt ?? now,
  };

  try {
    const existing = readSavedRememberances();
    const next = [
      normalized,
      ...existing.filter((item) => item.personaId !== normalized.personaId),
    ].slice(0, MAX_SAVED_REMEMBERANCES);

    window.localStorage.setItem(
      SAVED_REMEMBERANCES_STORAGE_KEY,
      JSON.stringify(next),
    );
  } catch {
    // localStorage is best-effort; persona navigation should never depend on it.
  }
}

function isSavedRememberance(value: unknown): value is SavedRememberance {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<SavedRememberance>;
  return (
    typeof candidate.personaId === "string" &&
    candidate.personaId.length > 0 &&
    typeof candidate.name === "string" &&
    candidate.name.length > 0 &&
    typeof candidate.relationship === "string" &&
    candidate.relationship.length > 0 &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.updatedAt === "string" &&
    (candidate.note === undefined || typeof candidate.note === "string")
  );
}
