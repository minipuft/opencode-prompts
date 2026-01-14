/**
 * Hooks Smoke Tests
 *
 * Tests the TypeScript library functions that power the OpenCode plugin.
 */

// Jest tests for hooks functionality
import {
  loadPromptsCache,
  getPromptById,
  matchPromptsToIntent,
  getChainsOnly,
  getSinglePromptsOnly,
} from "../../src/lib/cache-manager.js";
import {
  parsePromptEngineResponse,
  formatChainReminder,
  loadSessionState,
  saveSessionState,
  clearSessionState,
} from "../../src/lib/session-state.js";
import { getWorkspaceRoot, getCacheDir } from "../../src/lib/workspace.js";
import type { ChainState } from "../../src/lib/types.js";

describe("Workspace Resolution", () => {
  it("resolves workspace from project directory", () => {
    const projectDir = process.cwd();
    const workspace = getWorkspaceRoot(projectDir);

    // Should resolve to something (either env var or project dir)
    expect(workspace).not.toBeNull();
  });

  it("gets cache directory path", () => {
    const cacheDir = getCacheDir("./fallback");
    expect(cacheDir).toBeDefined();
    expect(typeof cacheDir).toBe("string");
  });
});

describe("Cache Manager", () => {
  it("loads prompts cache (if available)", () => {
    const cache = loadPromptsCache();

    // Cache may or may not exist depending on environment
    if (cache) {
      expect(cache.prompts).toBeDefined();
      expect(typeof cache.prompts).toBe("object");
    }
  });

  it("returns null for non-existent prompt", () => {
    const prompt = getPromptById("non_existent_prompt_id_12345");
    expect(prompt).toBeNull();
  });

  it("matches prompts to intent returns array", () => {
    const matches = matchPromptsToIntent("analyze code");
    expect(Array.isArray(matches)).toBe(true);
  });

  it("filters chains correctly", () => {
    const chains = getChainsOnly();
    expect(typeof chains).toBe("object");

    // All returned items should be chains
    for (const [, info] of Object.entries(chains)) {
      expect(info.is_chain).toBe(true);
    }
  });

  it("filters single prompts correctly", () => {
    const singles = getSinglePromptsOnly();
    expect(typeof singles).toBe("object");

    // All returned items should NOT be chains
    for (const [, info] of Object.entries(singles)) {
      expect(info.is_chain).toBe(false);
    }
  });
});

describe("Session State Management", () => {
  const testSessionId = "test-session-smoke-" + Date.now();

  it("saves and loads session state", () => {
    const testState: ChainState = {
      chain_id: "chain-test#1",
      current_step: 2,
      total_steps: 5,
      pending_gate: "code-quality",
      gate_criteria: ["Check for errors", "Verify types"],
      last_prompt_id: "analyze",
      pending_shell_verify: null,
      shell_verify_attempts: 0,
    };

    saveSessionState(testSessionId, testState);
    const loaded = loadSessionState(testSessionId);

    expect(loaded).not.toBeNull();
    expect(loaded?.chain_id).toBe("chain-test#1");
    expect(loaded?.current_step).toBe(2);
    expect(loaded?.total_steps).toBe(5);
    expect(loaded?.pending_gate).toBe("code-quality");
  });

  it("clears session state", () => {
    clearSessionState(testSessionId);
    const loaded = loadSessionState(testSessionId);
    expect(loaded).toBeNull();
  });
});

describe("Response Parsing", () => {
  it("parses step indicators from response", () => {
    const response = "Step 1 of 3\nSome content here";
    const state = parsePromptEngineResponse(response);

    expect(state).not.toBeNull();
    expect(state?.current_step).toBe(1);
    expect(state?.total_steps).toBe(3);
  });

  it("parses alternative step format", () => {
    const response = "Progress 2/4 - Implementing feature";
    const state = parsePromptEngineResponse(response);

    expect(state).not.toBeNull();
    expect(state?.current_step).toBe(2);
    expect(state?.total_steps).toBe(4);
  });

  it("extracts chain ID from response", () => {
    // Note: regex finds first chain-* or chain_* pattern
    const response = "Resume token: chain-analyze#2\nStep 2 of 3";
    const state = parsePromptEngineResponse(response);

    expect(state).not.toBeNull();
    expect(state?.chain_id).toBe("chain-analyze#2");
  });

  it("detects inline gates", () => {
    const response = `Step 1 of 2
## Inline Gates
### code-quality
- Check for type errors
- Verify test coverage`;

    const state = parsePromptEngineResponse(response);

    expect(state).not.toBeNull();
    expect(state?.pending_gate).toBe("code-quality");
  });

  it("detects shell verification", () => {
    const response = "Shell verification: npm test\nAttempt 2/5";
    const state = parsePromptEngineResponse(response);

    expect(state).not.toBeNull();
    expect(state?.pending_shell_verify).toBe("npm test");
    expect(state?.shell_verify_attempts).toBe(2);
  });

  it("returns null for plain text without chain markers", () => {
    const response = "This is just regular text without any chain or gate markers.";
    const state = parsePromptEngineResponse(response);
    expect(state).toBeNull();
  });
});

describe("Chain Reminder Formatting", () => {
  const testState: ChainState = {
    chain_id: "chain-implement#3",
    current_step: 2,
    total_steps: 4,
    pending_gate: "code-quality",
    gate_criteria: ["Type safety", "Test coverage"],
    last_prompt_id: "implement",
    pending_shell_verify: null,
    shell_verify_attempts: 0,
  };

  it("formats full reminder for compaction", () => {
    const reminder = formatChainReminder(testState, "full");

    expect(reminder).toContain("[Chain]");
    expect(reminder).toContain("2/4");
    expect(reminder).toContain("[Gate]");
    expect(reminder).toContain("code-quality");
    expect(reminder).toContain("GATE_REVIEW");
  });

  it("formats inline reminder for prompt-suggest", () => {
    const reminder = formatChainReminder(testState, "inline");

    expect(reminder).toContain("chain-implement#3");
    expect(reminder).toContain("2/4");
    expect(reminder).toContain("Gate:");
  });

  it("includes shell verify info when present", () => {
    const verifyState: ChainState = {
      ...testState,
      pending_gate: null,
      pending_shell_verify: "npm test",
      shell_verify_attempts: 2,
    };

    const reminder = formatChainReminder(verifyState, "full");
    expect(reminder).toContain("[Verify]");
    expect(reminder).toContain("npm test");
    expect(reminder).toContain("2/5");
  });
});
