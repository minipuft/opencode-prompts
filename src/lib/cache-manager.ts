/**
 * Cache manager for OpenCode prompts plugin.
 * Loads and queries MCP prompt/gate caches.
 *
 * Uses workspace resolution (MCP_WORKSPACE > OPENCODE_PLUGIN_ROOT > projectDir > fallback).
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { GateInfo, GatesCache, PromptInfo, PromptsCache } from "./types.js";
import { getCacheDir } from "./workspace.js";

// Resolve fallback cache directory relative to this file
let FALLBACK_CACHE_DIR: string;
try {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  FALLBACK_CACHE_DIR = join(__dirname, "..", "..", "server", "cache");
} catch {
  FALLBACK_CACHE_DIR = "./server/cache";
}

/**
 * Load cached prompt metadata.
 */
export function loadPromptsCache(projectDir?: string): PromptsCache | null {
  const cacheDir = getCacheDir(FALLBACK_CACHE_DIR, projectDir);
  const cachePath = join(cacheDir, "prompts.cache.json");

  if (!existsSync(cachePath)) {
    return null;
  }

  try {
    const content = readFileSync(cachePath, "utf-8");
    return JSON.parse(content) as PromptsCache;
  } catch {
    return null;
  }
}

/**
 * Load cached gate metadata.
 */
export function loadGatesCache(projectDir?: string): GatesCache | null {
  const cacheDir = getCacheDir(FALLBACK_CACHE_DIR, projectDir);
  const cachePath = join(cacheDir, "gates.cache.json");

  if (!existsSync(cachePath)) {
    return null;
  }

  try {
    const content = readFileSync(cachePath, "utf-8");
    return JSON.parse(content) as GatesCache;
  } catch {
    return null;
  }
}

/**
 * Get a specific prompt by ID.
 */
export function getPromptById(
  promptId: string,
  cache?: PromptsCache | null,
  projectDir?: string
): PromptInfo | null {
  const effectiveCache = cache ?? loadPromptsCache(projectDir);
  if (!effectiveCache) {
    return null;
  }
  return effectiveCache.prompts[promptId] ?? null;
}

/**
 * Match prompts based on keywords in user's prompt.
 * Returns list of [prompt_id, prompt_info, score] tuples sorted by score descending.
 */
export function matchPromptsToIntent(
  userPrompt: string,
  cache?: PromptsCache | null,
  maxResults = 5,
  projectDir?: string
): Array<[string, PromptInfo, number]> {
  const effectiveCache = cache ?? loadPromptsCache(projectDir);
  if (!effectiveCache) {
    return [];
  }

  const promptLower = userPrompt.toLowerCase();
  const matches: Array<[string, PromptInfo, number]> = [];

  for (const [promptId, data] of Object.entries(effectiveCache.prompts)) {
    let score = 0;

    // Keyword matching
    for (const keyword of data.keywords ?? []) {
      if (promptLower.includes(keyword)) {
        score += 10;
      }
    }

    // Category matching
    const category = data.category ?? "";
    if (promptLower.includes(category)) {
      score += 20;
    }

    // Name word matching
    const nameWords = (data.name ?? "").toLowerCase().split(/\s+/);
    for (const word of nameWords) {
      if (word.length > 3 && promptLower.includes(word)) {
        score += 15;
      }
    }

    // Boost chains (more comprehensive)
    if (data.is_chain && score > 0) {
      score += 5;
    }

    if (score > 0) {
      matches.push([promptId, data, score]);
    }
  }

  // Sort by score descending
  matches.sort((a, b) => b[2] - a[2]);
  return matches.slice(0, maxResults);
}

/**
 * Suggest relevant gates based on detected work types.
 * work_types can include: "code", "research", "security", "documentation"
 */
export function suggestGatesForWork(
  workTypes: string[],
  cache?: GatesCache | null,
  projectDir?: string
): Array<[string, GateInfo]> {
  const effectiveCache = cache ?? loadGatesCache(projectDir);
  if (!effectiveCache) {
    return [];
  }

  // Mapping of work types to relevant gate keywords
  const workGateMapping: Record<string, string[]> = {
    code: ["code", "quality", "test", "coverage"],
    research: ["research", "quality", "content", "accuracy"],
    security: ["security", "awareness", "pr-security"],
    documentation: ["content", "structure", "clarity", "educational"],
  };

  const suggested: Array<[string, GateInfo]> = [];
  const seenIds = new Set<string>();

  for (const workType of workTypes) {
    const keywords = workGateMapping[workType] ?? [];

    for (const [gateId, gateData] of Object.entries(effectiveCache.gates)) {
      if (seenIds.has(gateId)) {
        continue;
      }

      // Check if gate matches any keyword
      const gateTriggers = gateData.triggers ?? [];
      const gateNameLower = (gateData.name ?? "").toLowerCase();

      for (const keyword of keywords) {
        if (gateTriggers.includes(keyword) || gateNameLower.includes(keyword)) {
          suggested.push([gateId, gateData]);
          seenIds.add(gateId);
          break;
        }
      }
    }
  }

  return suggested.slice(0, 3); // Limit to 3 suggestions
}

/**
 * Get all prompts from cache.
 */
export function getAllPrompts(
  cache?: PromptsCache | null,
  projectDir?: string
): Record<string, PromptInfo> {
  const effectiveCache = cache ?? loadPromptsCache(projectDir);
  if (!effectiveCache) {
    return {};
  }
  return effectiveCache.prompts;
}

/**
 * Get only chain prompts from cache.
 */
export function getChainsOnly(
  cache?: PromptsCache | null,
  projectDir?: string
): Record<string, PromptInfo> {
  const prompts = getAllPrompts(cache, projectDir);
  return Object.fromEntries(
    Object.entries(prompts).filter(([, v]) => v.is_chain)
  );
}

/**
 * Get only single (non-chain) prompts from cache.
 */
export function getSinglePromptsOnly(
  cache?: PromptsCache | null,
  projectDir?: string
): Record<string, PromptInfo> {
  const prompts = getAllPrompts(cache, projectDir);
  return Object.fromEntries(
    Object.entries(prompts).filter(([, v]) => !v.is_chain)
  );
}
