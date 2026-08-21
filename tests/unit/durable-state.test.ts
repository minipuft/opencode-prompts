/**
 * Durable session state (plan row 3.3): persisted state survives a simulated
 * process restart, including armed exported-skill gates; cleanup removes the file.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "@jest/globals";

import {
  clearSessionState,
  evictMemorySession,
  loadSessionState,
  saveSessionState,
} from "../../src/lib/session-state.js";
import type { ChainState } from "../../src/lib/types.js";

let dir: string;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

const STATE: ChainState = {
  chain_id: "chain-restart#1",
  current_step: 3,
  total_steps: 5,
  pending_gate: "code-quality",
  gate_criteria: ["types", "tests"],
  last_prompt_id: "implement",
  pending_shell_verify: null,
  shell_verify_attempts: 0,
  gate_armed: {
    skillPath: "/home/user/.config/opencode/skills/strategicImplement",
    gates: [{ id: "workflow-preflight" }],
    armedAt: new Date().toISOString(),
  },
};

describe("durable session state", () => {
  it("recovers state from disk after a simulated restart", () => {
    dir = mkdtempSync(join(tmpdir(), "ocp-state-"));
    saveSessionState("restart-test", STATE, dir, true);

    // Simulate plugin process death: memory evicted, file remains.
    evictMemorySession("restart-test");

    const recovered = loadSessionState("restart-test", dir);
    expect(recovered).toEqual(STATE);
    expect(recovered?.gate_armed?.gates[0]?.id).toBe("workflow-preflight");
  });

  it("writes the state file when persistToFile is set", () => {
    dir = mkdtempSync(join(tmpdir(), "ocp-state-"));
    saveSessionState("file-test", STATE, dir, true);
    const path = join(dir, "server", "cache", "sessions", "file-test.json");
    expect(existsSync(path)).toBe(true);
    expect(JSON.parse(readFileSync(path, "utf-8")).chain_id).toBe("chain-restart#1");
  });

  it("clearSessionState removes both memory and the persisted file", () => {
    dir = mkdtempSync(join(tmpdir(), "ocp-state-"));
    saveSessionState("cleanup-test", STATE, dir, true);
    clearSessionState("cleanup-test", dir);
    expect(loadSessionState("cleanup-test", dir)).toBeNull();
    expect(existsSync(join(dir, "server", "cache", "sessions", "cleanup-test.json"))).toBe(false);
  });
});
