/**
 * Tiny client for the FastAPI worker. Used by route handlers to kick jobs
 * after a persona row is created.
 */

import type { WorkerJobRequest } from "@shared/types";

function workerHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const secret = process.env.WORKER_SHARED_SECRET;
  if (secret) headers["authorization"] = `Bearer ${secret}`;
  return headers;
}

export async function kickWorkerJob(req: WorkerJobRequest): Promise<void> {
  const base = process.env.WORKER_URL ?? "http://localhost:8000";
  const url = new URL("/jobs", base);
  const res = await fetch(url, {
    method: "POST",
    headers: workerHeaders(),
    body: JSON.stringify(req),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`worker /jobs returned ${res.status}: ${body.slice(0, 500)}`);
  }
}
