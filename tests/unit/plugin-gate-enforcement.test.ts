/**
 * Gate enforcement decisions (plan row 3.1).
 *
 * Mirrors upstream hooks/gate-enforce.py: FAIL blocks; a pending gate blocks
 * verdict-less resumes unless the call carries a generated resolution verb;
 * structured {overall} verdicts are parsed like strings.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "@jest/globals";

import {
  evaluateGateBlock,
  loadResolutionVerbs,
  resetVerbCache,
} from "../../src/lib/gate-enforcement.js";
import type { ChainState } from "../../src/lib/types.js";

const PENDING: ChainState = {
  chain_id: "chain-x#1",
  current_step: 2,
  total_steps: 4,
  pending_gate: "code-quality",
  gate_criteria: [],
  last_prompt_id: "implement",
  pending_shell_verify: null,
  shell_verify_attempts: 0,
};

describe("evaluateGateBlock", () => {
  it("passes when no gate is pending", () => {
    expect(evaluateGateBlock({ state: null })).toBeNull();
    expect(
      evaluateGateBlock({ state: { ...PENDING, pending_gate: null } })
    ).toBeNull();
  });

  it("blocks string FAIL verdicts", () => {
    const denial = evaluateGateBlock({
      state: PENDING,
      inputArgs: { gate_verdict: "GATE_REVIEW: FAIL - broken" },
    });
    expect(denial).toContain("Gate FAIL");
  });

  it("allows string PASS verdicts", () => {
    expect(
      evaluateGateBlock({
        state: PENDING,
        inputArgs: { gate_verdict: "GATE_REVIEW: PASS - ok" },
      })
    ).toBeNull();
  });

  it("blocks structured {overall: FAIL} verdicts", () => {
    const denial = evaluateGateBlock({
      state: PENDING,
      outputArgs: { gate_verdict: { overall: "FAIL", rationale: "bad" } },
    });
    expect(denial).toContain("structured");
  });

  it("allows structured {overall: PASS} verdicts", () => {
    expect(
      evaluateGateBlock({
        state: PENDING,
        outputArgs: { gate_verdict: { overall: "PASS", rationale: "ok" } },
      })
    ).toBeNull();
  });

  it("blocks verdict-less chain resumes with no resolution verb", () => {
    const denial = evaluateGateBlock({
      state: PENDING,
      inputArgs: { chain_id: "chain-x#1" },
    });
    expect(denial).toContain("requires a response");
  });

  it("accepts a gate_action-carrying resume when verbs are loaded", () => {
    resetVerbCache();
    // Simulate the generated contract by pointing MCP_WORKSPACE at a temp fixture.
    const dir = mkdtempSync(join(tmpdir(), "verbs-"));
    mkdirSync(join(dir, "hooks", "lib", "_generated"), { recursive: true });
    writeFileSync(
      join(dir, "hooks", "lib", "_generated", "resolution-verbs.json"),
      JSON.stringify(["cancel", "gate_action", "gate_verdict"])
    );
    process.env.MCP_WORKSPACE = dir;
    try {
      expect(loadResolutionVerbs()).toEqual(["cancel", "gate_action", "gate_verdict"]);
      expect(
        evaluateGateBlock({
          state: PENDING,
          inputArgs: { chain_id: "chain-x#1", gate_action: "retry" },
        })
      ).toBeNull();
    } finally {
      delete process.env.MCP_WORKSPACE;
      resetVerbCache();
    }
  });

  it("degrades to blocking when no verbs artifact resolves (fail-open)", () => {
    resetVerbCache();
    delete process.env.MCP_WORKSPACE;
    expect(loadResolutionVerbs("/nonexistent-project-dir")).toEqual([]);
    const denial = evaluateGateBlock({
      state: PENDING,
      inputArgs: { chain_id: "chain-x#1" },
    });
    expect(denial).toContain("requires a response");
  });
});
