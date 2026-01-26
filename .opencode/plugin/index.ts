/**
 * OpenCode Prompts Plugin
 *
 * Provides chain tracking, gate reminders, and state preservation
 * for the claude-prompts MCP server in OpenCode CLI.
 *
 * Event mapping from Claude Code:
 *   - PostToolUse → tool.execute.after (chain/gate tracking)
 *   - PreCompact → experimental.session.compacting (state preservation)
 *   - SessionStart → session.created (initialization)
 *   - Stop → session.deleted (cleanup)
 *
 * Note: Hooks (UserPromptSubmit, PostToolUse, PreCompact) are now handled
 * by claude-prompts plugin's hooks/hooks.json which auto-loads on installation.
 */

import { loadPromptsCache } from "../../src/lib/cache-manager.js";
import {
  loadSessionState,
  saveSessionState,
  clearSessionState,
  parsePromptEngineResponse,
  formatChainReminder,
} from "../../src/lib/session-state.js";

// Plugin context type (OpenCode plugin API)
interface PluginContext {
  project?: {
    directory?: string;
  };
  directory?: string;
}

// Tool execution input type
interface ToolExecuteInput {
  tool: string;
  args?: Record<string, unknown>;
  metadata?: {
    output?: string;
  };
  sessionID?: string;
  session_id?: string;
}

// Compaction input/output types
interface CompactionInput {
  sessionID?: string;
  session_id?: string;
}

interface CompactionOutput {
  context: string[];
  prompt?: string;
}

// Event payload type
interface EventPayload {
  type: string;
  sessionID?: string;
  session_id?: string;
}

/**
 * Extract session ID from various input formats.
 */
function extractSessionId(input: { sessionID?: string; session_id?: string }): string {
  return input.sessionID ?? input.session_id ?? "default";
}


/**
 * OpenCode Prompts Plugin
 *
 * Tracks chain/gate state and provides context injection for
 * the claude-prompts MCP server.
 */
export const OpenCodePromptsPlugin = async (ctx: PluginContext) => {
  const projectDir = ctx.project?.directory ?? ctx.directory;

  console.log("[opencode-prompts] Plugin loaded");

  // NOTE: MCP configuration is handled by:
  //   1. User's global config (~/.config/opencode/opencode.json)
  //   2. CLI install wizard (`opencode-prompts install`)
  // We intentionally do NOT auto-create project configs to avoid
  // overriding user's global settings (project config > global config).

  // Pre-load cache for faster access
  const cache = loadPromptsCache(projectDir);
  if (cache) {
    console.log(`[opencode-prompts] Loaded ${Object.keys(cache.prompts).length} prompts from cache`);
  } else {
    console.log("[opencode-prompts] No prompts cache found - MCP server may not have started yet");
  }

  return {
    /**
     * Hook: After tool execution
     *
     * Tracks chain/gate state from prompt_engine responses.
     * Equivalent to Claude Code's PostToolUse hook.
     */
    "tool.execute.after": async (input: ToolExecuteInput) => {
      // Only process prompt_engine calls
      if (!input.tool?.includes("prompt_engine")) {
        return;
      }

      const sessionId = extractSessionId(input);
      const response = input.metadata?.output ?? "";

      // Parse response for chain/gate state
      const state = parsePromptEngineResponse(response);
      if (!state) {
        return;
      }

      // Extract chain_id from tool args if available (higher priority)
      const inputChainId = input.args?.chain_id;
      if (typeof inputChainId === "string" && inputChainId) {
        state.chain_id = inputChainId;
      }

      // Save state for this session
      saveSessionState(sessionId, state, projectDir);

      // Build output lines for context injection
      const outputLines: string[] = [];

      // Gate reminder
      if (state.pending_gate) {
        const criteria = state.gate_criteria;
        const criteriaStr = criteria.length > 0
          ? criteria.slice(0, 3).map(c => c.slice(0, 40)).join(" | ")
          : "";

        outputLines.push(`[Gate] ${state.pending_gate}`);
        outputLines.push("  Respond: GATE_REVIEW: PASS|FAIL - <reason>");
        if (criteriaStr) {
          outputLines.push(`  Check: ${criteriaStr}`);
        }
      }

      // Chain continuation reminder
      if (state.current_step > 0 && state.total_steps > 0) {
        const step = state.current_step;
        const total = state.total_steps;
        if (step < total) {
          outputLines.push(`[Chain] Step ${step}/${total} - call prompt_engine to continue`);
        }
      }

      // Return context for injection
      if (outputLines.length > 0) {
        return {
          context: outputLines.join("\n"),
        };
      }
    },

    /**
     * Hook: Session compaction
     *
     * Preserves chain state across context compaction.
     * Equivalent to Claude Code's PreCompact hook.
     */
    "experimental.session.compacting": async (
      input: CompactionInput,
      output: CompactionOutput
    ) => {
      const sessionId = extractSessionId(input);
      const state = loadSessionState(sessionId, projectDir);

      if (!state) {
        return;
      }

      // Check if there's active chain/gate/verify state
      const hasActive =
        state.current_step > 0 ||
        state.pending_gate !== null ||
        state.pending_shell_verify !== null;

      if (!hasActive) {
        return;
      }

      // Format and inject chain state preservation
      const reminder = formatChainReminder(state, "full");
      output.context.push(`## Chain State (preserve across compaction)\n${reminder}`);
    },

    /**
     * Event handler for session lifecycle.
     */
    event: async ({ event }: { event: EventPayload }) => {
      if (event.type === "session.created") {
        console.log("[opencode-prompts] Session created");
      }

      if (event.type === "session.deleted") {
        const sessionId = extractSessionId(event);
        clearSessionState(sessionId, projectDir);
        console.log(`[opencode-prompts] Session ${sessionId} cleaned up`);
      }
    },
  };
};

// Default export for OpenCode plugin loader
export default OpenCodePromptsPlugin;
