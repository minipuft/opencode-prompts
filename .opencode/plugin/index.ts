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
 * Auto-setup:
 *   - Creates .claude/settings.json for oh-my-opencode integration
 *   - Enables UserPromptSubmit hook for >>prompt syntax detection
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, relative } from "path";
import { loadPromptsCache } from "../../src/lib/cache-manager.js";
import {
  loadSessionState,
  saveSessionState,
  clearSessionState,
  parsePromptEngineResponse,
  formatChainReminder,
} from "../../src/lib/session-state.js";
import { installMcpConfig } from "../../src/lib/opencode-config.js";

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
 * Hook configuration for oh-my-opencode integration.
 * These hooks enable Claude Code compatibility features.
 */
interface HookConfig {
  matcher: string;
  hooks: Array<{ type: "command"; command: string }>;
}

interface ClaudeHooksConfig {
  UserPromptSubmit?: HookConfig[];
  PostToolUse?: HookConfig[];
  PreCompact?: HookConfig[];
}

interface ClaudeSettings {
  hooks?: ClaudeHooksConfig;
  [key: string]: unknown;
}

/**
 * Auto-setup .claude/settings.json for oh-my-opencode integration.
 *
 * Creates or updates the settings file with hooks that enable:
 * - UserPromptSubmit: >>prompt syntax detection
 * - PostToolUse: chain/gate tracking (supplements native plugin)
 * - PreCompact: state preservation (supplements native plugin)
 *
 * @param projectDir - Project root directory
 */
function setupClaudeHooksConfig(projectDir: string | undefined): void {
  if (!projectDir) {
    console.log("[opencode-prompts] No project directory, skipping hooks setup");
    return;
  }

  const claudeDir = join(projectDir, ".claude");
  const settingsPath = join(claudeDir, "settings.json");

  // Calculate relative path from project to hooks in node_modules
  const hooksDir = join(projectDir, "node_modules", "claude-prompts", "hooks");
  const relativeHooksDir = relative(projectDir, hooksDir);

  // Define our hooks configuration
  const ourHooks: ClaudeHooksConfig = {
    UserPromptSubmit: [
      {
        matcher: "*",
        hooks: [
          {
            type: "command",
            command: `python3 ${relativeHooksDir}/prompt-suggest.py`,
          },
        ],
      },
    ],
    PostToolUse: [
      {
        matcher: "*prompt_engine*",
        hooks: [
          {
            type: "command",
            command: `python3 ${relativeHooksDir}/post-prompt-engine.py`,
          },
        ],
      },
    ],
    PreCompact: [
      {
        matcher: "*",
        hooks: [
          {
            type: "command",
            command: `python3 ${relativeHooksDir}/pre-compact.py`,
          },
        ],
      },
    ],
  };

  try {
    // Check if settings already exist
    if (existsSync(settingsPath)) {
      // Read existing settings
      const content = readFileSync(settingsPath, "utf-8");
      const existing: ClaudeSettings = JSON.parse(content);

      // Check if our hooks are already configured
      const hasUserPromptSubmit = existing.hooks?.UserPromptSubmit?.some(
        (h) => h.hooks?.some((cmd) => cmd.command?.includes("prompt-suggest.py"))
      );

      if (hasUserPromptSubmit) {
        console.log("[opencode-prompts] Claude hooks already configured");
        return;
      }

      // Merge our hooks with existing
      existing.hooks = existing.hooks ?? {};
      for (const [event, hooks] of Object.entries(ourHooks)) {
        const eventKey = event as keyof ClaudeHooksConfig;
        existing.hooks[eventKey] = [
          ...(existing.hooks[eventKey] ?? []),
          ...(hooks ?? []),
        ];
      }

      writeFileSync(settingsPath, JSON.stringify(existing, null, 2));
      console.log("[opencode-prompts] Added hooks to existing .claude/settings.json");
    } else {
      // Create new settings file
      mkdirSync(claudeDir, { recursive: true });

      const settings: ClaudeSettings = {
        $comment: "Auto-generated by opencode-prompts for oh-my-opencode integration",
        hooks: ourHooks,
      };

      writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      console.log("[opencode-prompts] Created .claude/settings.json for oh-my-opencode");
    }
  } catch (error) {
    // Non-fatal: plugin works without oh-my-opencode integration
    console.log(`[opencode-prompts] Could not setup Claude hooks: ${error}`);
  }
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

  // Auto-setup .claude/settings.json for oh-my-opencode integration
  // This enables UserPromptSubmit hook for >>prompt syntax detection
  setupClaudeHooksConfig(projectDir);

  // Auto-setup MCP configuration in opencode.json
  // This registers claude-prompts MCP server from node_modules
  installMcpConfig(projectDir);

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
