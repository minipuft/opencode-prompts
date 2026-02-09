/**
 * OpenCode Prompts Plugin
 *
 * Provides chain tracking, gate enforcement, skill catalog injection,
 * and state preservation for the claude-prompts MCP server in OpenCode CLI.
 *
 * Event mapping from Claude Code:
 *   - PreToolUse → tool.execute.before (gate enforcement)
 *   - PostToolUse → tool.execute.after (chain/gate tracking)
 *   - PreCompact → experimental.session.compacting (state preservation)
 *   - SessionStart → experimental.chat.system.transform (skill catalog)
 *   - Stop → session.deleted (cleanup)
 */

import {
  loadSessionState,
  saveSessionState,
  clearSessionState,
  parsePromptEngineResponse,
  formatChainReminder,
} from "../../src/lib/session-state.js";
import { scanSkillCatalog } from "../../src/lib/skill-catalog.js";

// Plugin context type (OpenCode plugin API)
interface PluginContext {
  project?: {
    directory?: string;
  };
  directory?: string;
}

// Tool execution input type (tool.execute.before and tool.execute.after)
interface ToolExecuteInput {
  tool: string;
  args?: Record<string, unknown>;
  metadata?: {
    output?: string;
  };
  sessionID?: string;
  session_id?: string;
}

// Tool execution output type (tool.execute.before receives this)
interface ToolExecuteOutput {
  args: Record<string, unknown>;
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

// System transform output type
interface SystemTransformOutput {
  system: string[];
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
 * Tracks chain/gate state, enforces gate verdicts, injects skill catalog,
 * and provides context injection for the claude-prompts MCP server.
 */
export const OpenCodePromptsPlugin = async (ctx: PluginContext) => {
  const projectDir = ctx.project?.directory ?? ctx.directory;

  console.log("[opencode-prompts] Plugin loaded");

  // Build skill catalog once at plugin load (reused on every system.transform call)
  const skillCatalog = scanSkillCatalog();
  if (skillCatalog) {
    console.log("[opencode-prompts] Skill catalog loaded");
  }

  return {
    /**
     * Hook: Before tool execution (gate enforcement)
     *
     * Blocks prompt_engine calls when a FAIL gate verdict is pending
     * or when a gate response is required but missing.
     * Equivalent to Claude Code's PreToolUse / Gemini's BeforeTool hook.
     */
    "tool.execute.before": async (input: ToolExecuteInput, output: ToolExecuteOutput) => {
      // Only enforce gates on prompt_engine calls
      if (!input.tool?.includes("prompt_engine")) {
        return;
      }

      const sessionId = extractSessionId(input);
      const state = loadSessionState(sessionId, projectDir);

      if (!state?.pending_gate) {
        return;
      }

      // Read gate_verdict from tool output args (OpenCode's pre-execution view)
      const verdict = output.args?.gate_verdict ?? input.args?.gate_verdict;

      // Block FAIL verdicts — agent must fix issues before continuing
      if (typeof verdict === "string" && verdict.toUpperCase().includes("FAIL")) {
        throw new Error(
          `Gate FAIL: "${verdict}". Fix the issues and retry with GATE_REVIEW: PASS - <reason>.`
        );
      }

      // Block if gate is pending but no verdict provided (resuming chain without responding)
      const chainId = output.args?.chain_id ?? input.args?.chain_id;
      if (state.pending_gate && !verdict && chainId) {
        throw new Error(
          `Gate "${state.pending_gate}" requires a response. ` +
          `Respond with: GATE_REVIEW: PASS|FAIL - <reason>`
        );
      }
    },

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
     * Hook: System prompt transform (skill catalog injection)
     *
     * Injects categorized skill catalog into every LLM system prompt.
     * Built once at plugin load time for efficiency.
     * Equivalent to Gemini's SessionStart / Claude Code's session-skills hook.
     */
    "experimental.chat.system.transform": async (
      _input: unknown,
      output: SystemTransformOutput
    ) => {
      if (skillCatalog) {
        output.system.push(skillCatalog);
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
