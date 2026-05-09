/**
 * Mux an audio track onto a (silent or noisy) video using ffmpeg-static.
 *
 * Veo returns an MP4 that may include its own model-generated audio. For the
 * memorial use case we want the user's cloned voice on top, so we:
 *   1. Drop whatever audio Veo produced.
 *   2. Map our ElevenLabs MP3 in as the audio track.
 *   3. Re-encode audio to AAC (so QuickTime / Safari play it) and copy the
 *      video stream as-is to keep the call cheap.
 *
 * The mux runs in a temp dir; we never leave files behind on success or
 * failure.
 */

import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegPathImport from "ffmpeg-static";

// `ffmpeg-static` exports a string path at runtime, but the type definitions
// model it as `string | null` (when no binary ships for the current platform).
const ffmpegPath = ffmpegPathImport as unknown as string | null;

export class VideoMuxError extends Error {
  details?: string;
  constructor(message: string, details?: string) {
    super(message);
    this.name = "VideoMuxError";
    this.details = details;
  }
}

export interface MuxOptions {
  video: Buffer;
  audio: Buffer;
  /** File extension for the audio buffer (no dot). Defaults to "mp3". */
  audioExt?: "mp3" | "wav" | "aac" | "m4a";
  /** File extension for the video buffer (no dot). Defaults to "mp4". */
  videoExt?: "mp4" | "mov";
}

export async function muxAudioOntoVideo(opts: MuxOptions): Promise<Buffer> {
  if (!ffmpegPath) {
    throw new VideoMuxError(
      "ffmpeg-static did not provide a binary for this platform",
    );
  }

  const { video, audio, audioExt = "mp3", videoExt = "mp4" } = opts;
  const dir = await mkdtemp(path.join(tmpdir(), "memorial-mux-"));
  const videoPath = path.join(dir, `in.${videoExt}`);
  const audioPath = path.join(dir, `in.${audioExt}`);
  const outPath = path.join(dir, "out.mp4");

  try {
    await Promise.all([
      writeFile(videoPath, video),
      writeFile(audioPath, audio),
    ]);

    const args = [
      "-y",
      "-i",
      videoPath,
      "-i",
      audioPath,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-shortest",
      "-movflags",
      "+faststart",
      outPath,
    ];

    await runFfmpeg(ffmpegPath, args);

    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function runFfmpeg(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stderrChunks: Buffer[] = [];

    proc.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });
    proc.on("error", (err) => {
      reject(new VideoMuxError(`Failed to spawn ffmpeg: ${err.message}`));
    });
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      reject(
        new VideoMuxError(
          `ffmpeg exited with code ${code}`,
          stderr.slice(-2000),
        ),
      );
    });
  });
}
