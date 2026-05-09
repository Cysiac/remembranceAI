"use client";

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";

import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";

const ACCEPT: Record<string, string[]> = {
  "text/plain": [".txt", ".md"],
  "message/rfc822": [".eml"],
  "application/json": [".json"],
  "audio/mpeg": [".mp3"],
  "audio/wav": [".wav"],
  "audio/x-m4a": [".m4a"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB per file

export interface UploadDropzoneProps {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fileTone(file: File): "info" | "warning" | "success" | "neutral" {
  const t = file.type;
  if (t.startsWith("audio/")) return "success";
  if (t.startsWith("image/")) return "info";
  if (t.startsWith("text/") || t === "application/json" || t === "message/rfc822")
    return "warning";
  return "neutral";
}

export function UploadDropzone({ files, onChange, disabled }: UploadDropzoneProps) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      const filtered = accepted.filter((f) => f.size <= MAX_BYTES);
      const dedup = new Map<string, File>();
      for (const existing of files) {
        dedup.set(`${existing.name}:${existing.size}`, existing);
      }
      for (const next of filtered) {
        dedup.set(`${next.name}:${next.size}`, next);
      }
      onChange(Array.from(dedup.values()));
    },
    [files, onChange],
  );

  const removeAt = (idx: number) => {
    const next = [...files];
    next.splice(idx, 1);
    onChange(next);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT,
    multiple: true,
    disabled,
    maxSize: MAX_BYTES,
  });

  return (
    <div className="flex flex-col gap-4">
      <div
        {...getRootProps({
          className: cn(
            "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-parchment-300 bg-white/60 px-6 py-10 text-center transition-colors",
            isDragActive && "border-gold-400 bg-gold-50/40",
            disabled && "cursor-not-allowed opacity-60",
          ),
        })}
      >
        <input {...getInputProps()} />
        <p className="font-serif text-xl text-ink">Bring their words and voice</p>
        <p className="mt-1 max-w-md text-sm text-ink-muted">
          Drag and drop letters (<code>.txt</code>, <code>.eml</code>,{" "}
          <code>.json</code>), audio (<code>.mp3</code>, <code>.wav</code>,{" "}
          <code>.m4a</code>), and photographs. Up to {formatBytes(MAX_BYTES)} per
          file.
        </p>
      </div>

      {files.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {files.map((file, idx) => (
            <li
              key={`${file.name}-${file.size}-${idx}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-parchment-200 bg-white/70 px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-3 truncate">
                <Badge tone={fileTone(file)} className="uppercase tracking-wider">
                  {file.type.split("/")[0] || "file"}
                </Badge>
                <span className="truncate font-medium text-ink">{file.name}</span>
                <span className="text-xs text-ink-muted">
                  {formatBytes(file.size)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => removeAt(idx)}
                disabled={disabled}
                className="text-xs text-ink-muted hover:text-ink-soft disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
