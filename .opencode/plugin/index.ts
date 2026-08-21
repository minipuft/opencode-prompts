/**
 * OpenCode Prompts Plugin
 *
 * Provides chain tracking, gate enforcement, and state preservation
 * for the claude-prompts MCP server in OpenCode CLI.
 *
 * Event mapping from Claude Code:
 *   - PreToolUse → tool.execute.before (gate enforcement)
 *   - PostToolUse → tool.execute.after (chain/gate tracking)
 *   - PreCompact → experimental.session.compacting (state preservation)
 *   - Stop → session.deleted (cleanup)
 */

import {
  loadSessionState,
  saveSessionState,
  clearSessionState,
  parsePromptEngineResponse,
  formatChainReminder,
} from "../../src/lib/session-state.js";
import {
  evaluateGateBlock,
  evaluateArmedGateBlock,
  detectSkillGateArm,
  disarmGate,
} from "../../src/lib/gate-enforcement.js";


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
 * Tracks chain/gate state, enforces gate verdicts, and provides
 * context injection for the claude-prompts MCP server.
 */
export const OpenCodePromptsPlugin = async (ctx: PluginContext) => {
  const projectDir = ctx.project?.directory ?? ctx.directory;

  console.log("[opencode-prompts] Plugin loaded");

  return {
    /**
     * Hook: Before tool execution (gate enforcement)
     *
     * Blocks prompt_engine calls when a FAIL gate verdict is pending
     * or when a gate response is required but missing.
     * Equivalent to Claude Code's PreToolUse / Gemini's BeforeTool hook.
     */
    "tool.execute.before": async (input: ToolExecuteInput, output: ToolExecuteOutput) => {
      const sessionId = extractSessionId(input);
      const state = loadSessionState(sessionId, projectDir);

      // Armed exported-skill gates block EVERY tool until reviewed (plan row 4.2).
      // A PASS verdict disarms and proceeds; FAIL keeps the gate armed.
      if (state?.gate_armed) {
        const armedDenial = evaluateArmedGateBlock(state, input.args, output.args);
        const verdict = output.args?.gate_verdict ?? input.args?.gate_verdict;
        const passed =
          (typeof verdict === "string" && verdict.toUpperCase().includes("PASS")) ||
          (verdict !== null &&
            typeof verdict === "object" &&
            String((verdict as Record<string, unknown>).overall ?? "").toUpperCase() === "PASS");
        if (!armedDenial) {
          saveSessionState(sessionId, disarmGate(state), projectDir, true);
        } else if (passed) {
          saveSessionState(sessionId, disarmGate(state), projectDir, true);
          return;
        } else {
          throw new Error(armedDenial);
        }
      }

      // Only enforce chain gates on prompt_engine calls
      if (!input.tool?.includes("prompt_engine")) {
        return;
      }

      const denial = evaluateGateBlock({
        state,
        inputArgs: input.args,
        outputArgs: output.args,
      });
      if (denial) {
        throw new Error(denial);
      }
    },

    /**
     * Hook: After tool execution
     *
     * Tracks chain/gate state from prompt_engine responses.
     * Equivalent to Claude Code's PostToolUse hook.
     */
    "tool.execute.after": async (input: ToolExecuteInput) => {
      // Arm exported-skill gates when the agent reads a gated skill (plan row 4.1).
      const arm = detectSkillGateArm(input.tool, input.args, projectDir);
      if (arm) {
        const armSessionId = extractSessionId(input);
        const existing = loadSessionState(armSessionId, projectDir) ?? {
          chain_id: "",
          current_step: 0,
          total_steps: 0,
          pending_gate: null,
          gate_criteria: [],
          last_prompt_id: "",
          pending_shell_verify: null,
          shell_verify_attempts: 0,
        };
        if (existing.gate_armed?.skillPath !== arm.skillPath) {
          existing.gate_armed = {
            skillPath: arm.skillPath,
            gates: arm.gates,
            armedAt: new Date().toISOString(),
          };
          saveSessionState(armSessionId, existing, projectDir, true);
        }
      }

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

      // Save state for this session — persisted to file so a plugin restart
      // (or OpenCode restart) recovers chain/gate/armed-gate state (plan row 3.3).
      saveSessionState(sessionId, state, projectDir, true);

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
