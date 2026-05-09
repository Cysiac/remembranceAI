/* eslint-disable no-console */
/**
 * One-off bake script that produces a demo persona end-to-end.
 *
 * It does the work the worker would normally do — clones a voice, uploads a
 * knowledge-base doc, creates a Conversational AI agent — plus optionally
 * generates a Veo video so DEMO_VIDEO_URL has something to point at.
 *
 * The reason this lives outside the worker: the demo only needs to be baked
 * once per environment, and we want to be able to do it from a laptop without
 * standing up the FastAPI worker first.
 *
 * Usage:
 *   cd apps/web
 *   cp .env.example .env.local       # fill in keys (ELEVENLABS_API_KEY, etc.)
 *   npm run bake:demo -- \
 *     --voice ./scripts/demo-fixtures/grandma-voice.mp3 \
 *     --photo ./scripts/demo-fixtures/grandma-photo.jpg \
 *     [--video]
 *
 * Outputs a `DEMO_*` env block you can paste into Vercel / `.env.local`.
 */

import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { config as loadEnv } from "dotenv";

import { textToSpeech } from "../lib/elevenlabs";
import { getServiceSupabase } from "../lib/supabaseServer";
import { generateVeoVideo } from "../lib/veo";
import { muxAudioOntoVideo } from "../lib/videoMux";

interface CliFlags {
  voice?: string;
  photo?: string;
  prompt?: string;
  stories?: string;
  name: string;
  relationship: string;
  firstMessage: string;
  withVideo: boolean;
}

const FIXTURES_DIR = path.resolve(__dirname, "demo-fixtures");

function parseFlags(argv: string[]): CliFlags {
  const out: CliFlags = {
    name: "Grandma Iris",
    relationship: "grandmother",
    firstMessage: "Hi sweetheart — it's Grandma. So glad you came by.",
    withVideo: false,
    prompt: path.join(FIXTURES_DIR, "grandma-prompt.md"),
    stories: path.join(FIXTURES_DIR, "grandma-stories.md"),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    switch (a) {
      case "--voice":
        out.voice = next;
        i++;
        break;
      case "--photo":
        out.photo = next;
        i++;
        break;
      case "--prompt":
        out.prompt = next;
        i++;
        break;
      case "--stories":
        out.stories = next;
        i++;
        break;
      case "--name":
        out.name = next;
        i++;
        break;
      case "--relationship":
        out.relationship = next;
        i++;
        break;
      case "--first":
        out.firstMessage = next;
        i++;
        break;
      case "--video":
        out.withVideo = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
    }
  }
  return out;
}

function printHelp(): void {
  console.log(
    `bake-demo-persona — one-off bake of the public demo persona\n\n` +
      `Required:\n` +
      `  --voice <path>     audio sample (mp3/wav/m4a) for voice cloning\n\n` +
      `Optional:\n` +
      `  --photo <path>     reference image (jpg/png) used when --video is set\n` +
      `  --prompt <path>    system-prompt markdown (default: grandma-prompt.md)\n` +
      `  --stories <path>   knowledge-base markdown (default: grandma-stories.md)\n` +
      `  --name <string>    persona name (default: "Grandma Iris")\n` +
      `  --relationship <s> default: "grandmother"\n` +
      `  --first <string>   first message the agent will greet with\n` +
      `  --video            also bake a Veo demo MP4 and upload to Supabase Storage\n`,
  );
}

async function main(): Promise<void> {
  loadEnv({ path: path.resolve(__dirname, "..", ".env.local") });
  loadEnv({ path: path.resolve(__dirname, "..", ".env") });

  const flags = parseFlags(process.argv.slice(2));
  if (!flags.voice) {
    console.error("Missing required --voice <path>. Try --help.");
    process.exit(1);
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error("ELEVENLABS_API_KEY must be set in env.");
    process.exit(1);
  }

  const systemPrompt = await readText(flags.prompt!, "system prompt");
  const stories = await readText(flags.stories!, "stories");

  console.log(`Cloning voice from ${flags.voice}...`);
  const voiceId = await cloneVoice({
    apiKey,
    name: `${flags.name} (${flags.relationship}) - DEMO`,
    audioPath: flags.voice,
  });
  console.log(`  voice_id = ${voiceId}`);

  console.log("Uploading knowledge-base document...");
  const kbDocId = await uploadKbDocument({
    apiKey,
    name: `${flags.name}-stories`,
    text: stories,
  });
  console.log(`  kb_doc_id = ${kbDocId}`);

  console.log("Creating Conversational AI agent...");
  const agentId = await createAgent({
    apiKey,
    name: `${flags.name} memorial - DEMO`,
    voiceId,
    systemPrompt,
    firstMessage: flags.firstMessage,
    knowledgeBaseDocIds: [kbDocId],
  });
  console.log(`  agent_id = ${agentId}`);

  let videoUrl: string | null = null;
  if (flags.withVideo) {
    if (!flags.photo) {
      console.error("--video requires --photo <path> (a reference image).");
      process.exit(1);
    }
    if (!process.env.GEMINI_API_KEY) {
      console.error("--video requires GEMINI_API_KEY in env.");
      process.exit(1);
    }
    console.log("Generating Veo video + cloned-voice audio... (this can take 1–3 minutes)");
    videoUrl = await bakeDemoVideo({
      voiceId,
      photoPath: flags.photo,
      personaName: flags.name,
    });
    console.log(`  video_url = ${videoUrl}`);
  }

  console.log("\nDone. Paste the following into Vercel env (and your .env.local):\n");
  console.log(`DEMO_VOICE_ID=${voiceId}`);
  console.log(`DEMO_AGENT_ID=${agentId}`);
  if (videoUrl) console.log(`DEMO_VIDEO_URL=${videoUrl}`);
}

async function readText(filePath: string, label: string): Promise<string> {
  try {
    return (await readFile(filePath, "utf8")).trim();
  } catch (err) {
    throw new Error(`Failed to read ${label} from ${filePath}: ${(err as Error).message}`);
  }
}

async function cloneVoice(args: {
  apiKey: string;
  name: string;
  audioPath: string;
}): Promise<string> {
  const buffer = await readFile(args.audioPath);
  const form = new FormData();
  form.append("name", args.name);
  form.append("description", "Memorial AI demo voice");
  form.append(
    "files",
    new Blob([buffer], { type: guessAudioMime(args.audioPath) }),
    path.basename(args.audioPath),
  );

  const res = await fetch("https://api.elevenlabs.io/v1/voices/add", {
    method: "POST",
    headers: { "xi-api-key": args.apiKey },
    body: form,
  });
  if (!res.ok) throw new Error(`voice/add failed: ${res.status} ${await safeText(res)}`);
  const body = (await res.json()) as { voice_id?: string };
  if (!body.voice_id) throw new Error(`voice/add returned no voice_id: ${JSON.stringify(body)}`);
  return body.voice_id;
}

async function uploadKbDocument(args: {
  apiKey: string;
  name: string;
  text: string;
}): Promise<string> {
  const form = new FormData();
  form.append("name", args.name);
  form.append(
    "file",
    new Blob([args.text], { type: "text/plain" }),
    `${args.name}.txt`,
  );
  const res = await fetch("https://api.elevenlabs.io/v1/convai/knowledge-base", {
    method: "POST",
    headers: { "xi-api-key": args.apiKey },
    body: form,
  });
  if (!res.ok) throw new Error(`kb upload failed: ${res.status} ${await safeText(res)}`);
  const body = (await res.json()) as { id?: string; document_id?: string };
  const id = body.id ?? body.document_id;
  if (!id) throw new Error(`kb upload returned no id: ${JSON.stringify(body)}`);
  return id;
}

async function createAgent(args: {
  apiKey: string;
  name: string;
  voiceId: string;
  systemPrompt: string;
  firstMessage: string;
  knowledgeBaseDocIds: string[];
}): Promise<string> {
  const payload = {
    name: args.name,
    conversation_config: {
      agent: {
        prompt: {
          prompt: args.systemPrompt,
          knowledge_base: args.knowledgeBaseDocIds.map((id) => ({ id, type: "file" })),
        },
        first_message: args.firstMessage,
        language: "en",
      },
      tts: { voice_id: args.voiceId },
    },
  };

  const res = await fetch("https://api.elevenlabs.io/v1/convai/agents/create", {
    method: "POST",
    headers: {
      "xi-api-key": args.apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`agents/create failed: ${res.status} ${await safeText(res)}`);
  }
  const body = (await res.json()) as { agent_id?: string; id?: string };
  const id = body.agent_id ?? body.id;
  if (!id) throw new Error(`agents/create returned no id: ${JSON.stringify(body)}`);
  return id;
}

async function bakeDemoVideo(args: {
  voiceId: string;
  photoPath: string;
  personaName: string;
}): Promise<string> {
  const photoBytes = await readFile(args.photoPath);
  const mimeType = guessImageMime(args.photoPath);

  const veoPrompt =
    `Create a gentle memorial video of ${args.personaName} from the provided ` +
    `reference photo. Use a warm, respectful, realistic style with subtle head ` +
    `and facial movement. Do not add text, captions, logos, or watermarks.`;

  const ttsScript =
    `Hi sweetheart — it's Grandma. I'm so glad you came to talk. ` +
    `Now you listen: whenever you don't know what to do, do the next small kind thing.`;

  const [voiceMp3, veoMp4] = await Promise.all([
    textToSpeech({ voice_id: args.voiceId, text: ttsScript }),
    generateVeoVideo({ prompt: veoPrompt, imageBytes: photoBytes, mimeType }),
  ]);

  const finalMp4 = await muxAudioOntoVideo({ video: veoMp4, audio: voiceMp3 });

  const supabase = getServiceSupabase();
  const key = `demo/${randomUUID()}.mp4`;
  const upload = await supabase.storage.from("videos").upload(key, finalMp4, {
    contentType: "video/mp4",
    upsert: true,
  });
  if (upload.error) throw new Error(`demo upload failed: ${upload.error.message}`);

  // 7-day signed URL is enough for a hackathon demo; rebake when it expires.
  const signed = await supabase.storage
    .from("videos")
    .createSignedUrl(key, 60 * 60 * 24 * 7);
  if (signed.error || !signed.data?.signedUrl) {
    throw new Error(`demo signed url failed: ${signed.error?.message ?? "unknown"}`);
  }
  return signed.data.signedUrl;
}

function guessAudioMime(p: string): string {
  const ext = p.toLowerCase().split(".").pop();
  if (ext === "wav") return "audio/wav";
  if (ext === "m4a") return "audio/mp4";
  if (ext === "ogg") return "audio/ogg";
  return "audio/mpeg";
}

function guessImageMime(p: string): string {
  const ext = p.toLowerCase().split(".").pop();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "";
  }
}

void Buffer; // keep type-only import alive when tree-shaking

main().catch((err) => {
  console.error("\nbake-demo-persona failed:", err.message ?? err);
  process.exit(1);
});
