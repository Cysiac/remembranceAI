/**
 * Lightweight runtime test (no jest/vitest assumed). Run with:
 *   pnpm tsx apps/web/lib/__tests__/promptBuilder.test.ts
 * or just import it from a route during development.
 */

import { strict as assert } from "node:assert";

import type { Persona } from "@shared/types";
import {
  buildStandaloneVideoScriptPrompt,
  buildSystemPrompt,
  buildVideoScriptPrompt,
} from "../promptBuilder";

const persona: Persona = {
  id: "00000000-0000-0000-0000-000000000000",
  name: "Grandma Iris",
  relationship: "grandmother",
  status: "ready",
  voice_id: "vc_demo",
  agent_id: "ag_demo",
  metadata: {
    catchphrases: ["lake house", "to the moon and back", "the cake knows"],
    memoryAnchors: [
      {
        title: "Lake house weekends",
        people: ["Iris", "Grandpa", "you"],
        description: "Cold June water, big laughs, Iris reading on the porch.",
      },
    ],
  },
  createdAt: new Date().toISOString(),
};

const system = buildSystemPrompt(persona);
assert.ok(system.includes("Grandma Iris"), "system prompt should include the name");
assert.ok(system.includes("grandmother"), "system prompt should include the relationship");
assert.ok(system.includes("lake house"), "system prompt should include catchphrases");
assert.ok(system.includes("Lake house weekends"), "system prompt should include memory anchors");
assert.ok(system.includes("Hard Rules"), "system prompt should include hard safety rules");

const scenePrompt = buildVideoScriptPrompt(persona, "wish me happy 30th birthday");
assert.ok(scenePrompt.includes("happy 30th birthday"), "scene prompt should embed the user scene");
assert.ok(scenePrompt.includes("30–45 seconds"), "scene prompt should set length expectations");

const standalone = buildStandaloneVideoScriptPrompt(persona, "wish me happy birthday");
assert.ok(standalone.includes("Hard Rules"), "standalone prompt includes safety rules");
assert.ok(standalone.includes("happy birthday"), "standalone prompt includes the scene");

console.log("promptBuilder.test.ts: ok");
