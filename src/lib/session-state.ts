/**
 * Session state manager for OpenCode prompts plugin.
 * Tracks chain/gate state per conversation session.
 *
 * Unlike Python version (file-based), this uses in-memory Map for state
 * since OpenCode plugins persist in memory during the session.
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ChainState } from "./types.js";
import { getCacheDir } from "./workspace.js";

// In-memory session state (primary storage for OpenCode)
const sessionStates = new Map<string, ChainState>();

// Resolve fallback session state directory
let FALLBACK_SESSION_DIR: string;
try {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  FALLBACK_SESSION_DIR = join(__dirname, "..", "..", "server", "cache", "sessions");
} catch {
  FALLBACK_SESSION_DIR = "./server/cache/sessions";
}

/**
 * Get session state directory path.
 */
function getSessionStateDir(projectDir?: string): string {
  const cacheDir = getCacheDir(FALLBACK_SESSION_DIR, projectDir);
  return join(cacheDir, "sessions");
}

/**
 * Get path to session state file.
 */
function getSessionStatePath(sessionId: string, projectDir?: string): string {
  const stateDir = getSessionStateDir(projectDir);
  if (!existsSync(stateDir)) {
    mkdirSync(stateDir, { recursive: true });
  }
  return join(stateDir, `${sessionId}.json`);
}

/**
 * Load chain state for a session.
 * Checks in-memory first, then falls back to file.
 */
export function loadSessionState(
  sessionId: string,
  projectDir?: string
): ChainState | null {
  // Check in-memory first (primary for OpenCode)
  const inMemory = sessionStates.get(sessionId);
  if (inMemory) {
    return inMemory;
  }

  // Fall back to file-based storage
  const statePath = getSessionStatePath(sessionId, projectDir);
  if (!existsSync(statePath)) {
    return null;
  }

  try {
    const content = readFileSync(statePath, "utf-8");
    const state = JSON.parse(content) as ChainState;
    // Cache in memory for faster subsequent access
    sessionStates.set(sessionId, state);
    return state;
  } catch {
    return null;
  }
}

/**
 * Save chain state for a session.
 * Stores in-memory and optionally persists to file.
 */
export function saveSessionState(
  sessionId: string,
  state: ChainState,
  projectDir?: string,
  persistToFile = false
): void {
  // Always store in memory
  sessionStates.set(sessionId, state);

  // Optionally persist to file (for recovery across restarts)
  if (persistToFile) {
    const statePath = getSessionStatePath(sessionId, projectDir);
    try {
      writeFileSync(statePath, JSON.stringify(state, null, 2));
    } catch {
      // Silently fail file persistence
    }
  }
}

/**
 * Clear chain state when chain completes.
 */
export function clearSessionState(sessionId: string, projectDir?: string): void {
  // Clear in-memory
  sessionStates.delete(sessionId);

  // Clear file if exists
  const statePath = getSessionStatePath(sessionId, projectDir);
  if (existsSync(statePath)) {
    try {
      unlinkSync(statePath);
    } catch {
      // Silently fail
    }
  }
}

/**
 * Get all in-memory session states (for debugging).
 */
export function getAllSessionStates(): Map<string, ChainState> {
  return new Map(sessionStates);
}

/**
 * Parse prompt_engine response to extract chain/gate state.
 *
 * The response typically contains markers like:
 * - "Step X of Y"
 * - "## Inline Gates" section
 * - Gate criteria in the rendered prompt
 */
export function parsePromptEngineResponse(
  response: string | Record<string, unknown>
): ChainState | null {
  let content: string;

  if (typeof response === "object" && response !== null) {
    // Handle structured response
    const contentField = response.content;
    if (typeof contentField === "string") {
      content = contentField;
    } else if (Array.isArray(contentField)) {
      // Handle array of content blocks
      content = contentField
        .map((block) => {
          if (typeof block === "string") return block;
          if (typeof block === "object" && block !== null && "text" in block) {
            return (block as { text: string }).text;
          }
          return String(block);
        })
        .join(" ");
    } else {
      content = String(response);
    }
  } else {
    content = String(response);
  }

  const state: ChainState = {
    chain_id: "",
    current_step: 0,
    total_steps: 0,
    pending_gate: null,
    gate_criteria: [],
    last_prompt_id: "",
    pending_shell_verify: null,
    shell_verify_attempts: 0,
  };

  // Detect step indicators: "Step 1 of 3", "step 2/4", "Progress 1/2", etc.
  const stepMatch = content.match(
    /(?:[Ss]tep|[Pp]rogress)\s+(\d+)\s*(?:of|\/)\s*(\d+)/
  );
  if (stepMatch) {
    state.current_step = parseInt(stepMatch[1], 10);
    state.total_steps = parseInt(stepMatch[2], 10);
  }

  // Detect chain_id from resume token pattern (capture full ID including prefix)
  const chainMatch = content.match(/(chain[-_][a-zA-Z0-9_#-]+)/);
  if (chainMatch) {
    state.chain_id = chainMatch[1];
  }

  // Detect inline gates section
  if (content.includes("## Inline Gates") || content.includes("Gate")) {
    // Extract gate names
    const gateNames = content.match(/###\s*([A-Za-z][A-Za-z0-9 _-]+)\n/g);
    if (gateNames && gateNames.length > 0) {
      const firstGate = gateNames[0].replace(/^###\s*/, "").replace(/\n$/, "");
      state.pending_gate = firstGate.trim();
    }

    // Extract gate criteria
    const criteria = content.match(/[-•]\s*(.+?)(?:\n|$)/g);
    if (criteria) {
      state.gate_criteria = criteria
        .slice(0, 5)
        .map((c) => c.replace(/^[-•]\s*/, "").trim())
        .filter((c) => c.length > 0);
    }
  }

  // Detect shell verification: "Shell verification: npm test"
  const verifyMatch = content.match(/Shell verification:\s*(.+?)(?:\n|$)/);
  if (verifyMatch) {
    state.pending_shell_verify = verifyMatch[1].trim();
  }

  // Detect attempt count: "Attempt 2/5" or "(Attempt 2/5)"
  const attemptMatch = content.match(/Attempt\s+(\d+)\/(\d+)/);
  if (attemptMatch) {
    state.shell_verify_attempts = parseInt(attemptMatch[1], 10);
  }

  // Only return state if we found chain/gate/verify info
  if (
    state.current_step > 0 ||
    state.pending_gate ||
    state.pending_shell_verify
  ) {
    return state;
  }

  return null;
}

/**
 * Format a reminder about active chain state.
 *
 * @param state - Chain state to format
 * @param mode - "full" for PreCompact (multi-line), "inline" for prompt-suggest (two-line)
 */
export function formatChainReminder(
  state: ChainState,
  mode: "full" | "inline" = "full"
): string {
  const chainId = state.chain_id;
  const step = state.current_step;
  const total = state.total_steps;
  const gate = state.pending_gate;
  const verifyCmd = state.pending_shell_verify;
  const verifyAttempts = state.shell_verify_attempts || 1;

  if (mode === "inline") {
    // Two-line hybrid: Line 1 = status, Line 2 = action
    const parts: string[] = [];
    if (step > 0) {
      const chainLabel = chainId || "active";
      parts.push(`[${chainLabel}] ${step}/${total}`);
    }
    if (gate) {
      parts.push(`Gate: ${gate}`);
    }
    if (verifyCmd) {
      parts.push(`Verify: ${verifyAttempts}/5`);
    }
    const line1 = parts.length > 0 ? parts.join(" | ") : "";

    // Line 2: Clear continuation instruction
    let line2 = "";
    if (verifyCmd) {
      line2 = `→ Shell verify: \`${verifyCmd}\` will validate`;
    } else if (gate) {
      line2 = "→ GATE_REVIEW: PASS|FAIL - <reason>";
    } else if (step > 0 && step < total) {
      line2 = `→ prompt_engine(chain_id:"${chainId}") to continue`;
    }

    return line1 ? `${line1}\n${line2}`.trim() : "";
  }

  // Full format for PreCompact (preserves context across compaction)
  const lines: string[] = [];
  if (step > 0) {
    if (chainId) {
      lines.push(`[Chain] ${chainId} - Step ${step}/${total}`);
    } else {
      lines.push(`[Chain] Step ${step}/${total}`);
    }
  }

  if (gate) {
    lines.push(`[Gate] ${gate} - Respond: GATE_REVIEW: PASS|FAIL - <reason>`);
  }

  if (verifyCmd) {
    lines.push(`[Verify] \`${verifyCmd}\` - Attempt ${verifyAttempts}/5`);
    lines.push("Run implementation, then prompt_engine validates with shell command");
  }

  return lines.join("\n");
}
