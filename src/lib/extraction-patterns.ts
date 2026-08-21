/**
 * Extraction-pattern loader for the OpenCode prompts plugin.
 *
 * Single source: hooks/lib/_generated/extraction-patterns.json, generated upstream by
 * claude-prompts' `npm run generate:contracts`. The bundled defaults below mirror the
 * Python hooks' semantics and serve as the fail-open fallback when the artifact is
 * missing — a stale install degrades to correct-but-frozen behavior rather than crashing.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface ExtractionPatterns {
  /** Step indicators: "Step 1 of 3", "Progress 2/4", "complete (2/2)" */
  step: string;
  /** Chain resume token: chain-<name>#<run> */
  chainId: string;
  /** Review-required headers (current + legacy variants) */
  gateHeader: string;
  /** "**Gates**: id1, id2" list following a review header */
  gatesList: string;
  /** Structured verdict object: {"overall": "PASS"|"FAIL"} */
  structuredVerdict: string;
}

export const DEFAULT_PATTERNS: ExtractionPatterns = {
  step: "(?:[Ss]tep|[Pp]rogress|[Cc]omplete)\\s*\\(?(\\d+)\\s*(?:of|/)\\s*(\\d+)",
  chainId: "(chain-[a-zA-Z0-9_#-]+)",
  gateHeader: "\\*\\*(?:Structural \\+ Gate |Structural |Gate )?Review Required\\*\\*",
  gatesList: "\\*\\*Gates\\*\\*:\\s*(.+?)(?:\n|$)",
  structuredVerdict: '"overall"\\s*:\\s*"(PASS|FAIL)"',
};

let cached: ExtractionPatterns | null = null;

/** Reset the pattern cache — tests only. */
export function resetPatternCache(): void {
  cached = null;
}

function candidatePaths(projectDir?: string): string[] {
  const rel = join("hooks", "lib", "_generated", "extraction-patterns.json");
  const candidates: string[] = [];
  const mcpWorkspace = process.env.MCP_WORKSPACE;
  if (mcpWorkspace) candidates.push(join(mcpWorkspace, rel));
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    candidates.push(resolve(here, "..", "..", "node_modules", "claude-prompts", rel));
    candidates.push(resolve(here, "..", "..", "..", "node_modules", "claude-prompts", rel));
  } catch {
    // import.meta.url unavailable in some contexts
  }
  if (projectDir) candidates.push(join(projectDir, "node_modules", "claude-prompts", rel));
  return candidates;
}

/**
 * Load extraction patterns from the generated contract, falling back to the bundled
 * defaults. Invalid entries are ignored individually so one bad key cannot poison all.
 */
export function loadExtractionPatterns(projectDir?: string): ExtractionPatterns {
  if (cached) return cached;
  const patterns: ExtractionPatterns = { ...DEFAULT_PATTERNS };
  for (const candidate of candidatePaths(projectDir)) {
    try {
      if (!existsSync(candidate)) continue;
      const parsed = JSON.parse(readFileSync(candidate, "utf-8")) as Record<string, unknown>;
      for (const key of Object.keys(DEFAULT_PATTERNS) as Array<keyof ExtractionPatterns>) {
        const value = parsed[key];
        if (typeof value === "string" && value) patterns[key] = value;
      }
      break;
    } catch {
      // try next candidate
    }
  }
  cached = patterns;
  return patterns;
}
