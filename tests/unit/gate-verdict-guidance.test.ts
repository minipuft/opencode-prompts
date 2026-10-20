/**
 * Gate verdict guidance and verdict reading.
 *
 * claude-prompts 6.0 accepts `gate_verdict` only as a structured object and refuses a
 * string. Text that tells the model what to SEND must name the object; code that READS
 * a verdict must keep accepting both shapes (a 5.x engine still sends strings) and
 * must not throw on a malformed value.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";

import { OpenCodePromptsPlugin } from "../../.opencode/plugin/index.js";
import {
  evaluateArmedGateBlock,
  evaluateGateBlock,
} from "../../src/lib/gate-enforcement.js";
import {
  GATE_VERDICT_PASS_EXAMPLE,
  GATE_VERDICT_REPLY,
} from "../../src/lib/gate-verdict-guidance.js";
import { formatChainReminder } from "../../src/lib/session-state.js";
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

const ARMED: ChainState = {
  ...PENDING,
  pending_gate: null,
  gate_armed: {
    skillPath: "/skills/strategicImplement",
    gates: [{ id: "workflow-preflight" }],
    armedAt: "2026-10-20T00:00:00.000Z",
  },
};

/** The engine's object form, and the legacy string it now refuses. */
const OBJECT_SHAPE = /"overall"\s*:\s*"PASS"\s*\|\s*"FAIL"/;
const LEGACY_STRING = /GATE_REVIEW/;

function expectsObject(text: string | null | undefined): void {
  expect(text).toEqual(expect.stringContaining("gate_verdict"));
  expect(text).toEqual(expect.stringContaining('"overall"'));
  expect(text).toEqual(expect.stringContaining('"rationale"'));
  expect(text).not.toMatch(LEGACY_STRING);
}

describe("guidance names the structured gate_verdict object", () => {
  it("defines the reply once, as the object", () => {
    expectsObject(GATE_VERDICT_REPLY);
    expect(GATE_VERDICT_REPLY).toMatch(OBJECT_SHAPE);
    expectsObject(GATE_VERDICT_PASS_EXAMPLE);
    expect(JSON.parse(GATE_VERDICT_PASS_EXAMPLE.slice("gate_verdict: ".length))).toEqual({
      overall: "PASS",
      rationale: "<reason>",
    });
  });

  it("inline and full chain reminders teach the object", () => {
    expectsObject(formatChainReminder(PENDING, "inline"));
    expectsObject(formatChainReminder(PENDING, "full"));
  });

  it("denials for a pending gate teach the object", () => {
    expectsObject(
      evaluateGateBlock({ state: PENDING, inputArgs: { chain_id: "chain-x#1" } })
    );
    expectsObject(
      evaluateGateBlock({
        state: PENDING,
        outputArgs: { gate_verdict: { overall: "FAIL", rationale: "bad" } },
      })
    );
    expectsObject(
      evaluateGateBlock({ state: PENDING, inputArgs: { gate_verdict: "FAIL: broken" } })
    );
  });

  it("denials for an armed exported-skill gate teach the object", () => {
    expectsObject(evaluateArmedGateBlock(ARMED, { command: "ls" }));
    expectsObject(
      evaluateArmedGateBlock(ARMED, { gate_verdict: { overall: "FAIL", rationale: "bad" } })
    );
  });

  it("the plugin's post-tool reminder teaches the object", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ocp-guidance-"));
    try {
      const plugin = await OpenCodePromptsPlugin({ directory: dir });
      const result = await plugin["tool.execute.after"]({
        tool: "prompt_engine",
        sessionID: "guidance-session",
        args: { command: ">>implement" },
        metadata: {
          output:
            "**Review Required**\n\n**Gates**: code-quality\n\nStep 2 of 4\nchain-implement#3",
        },
      });
      expect(result?.context).toContain("[Gate] code-quality");
      expectsObject(result?.context);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("verdict readers accept both shapes", () => {
  it("pending-gate check: legacy string and object give the same decision", () => {
    const decide = (gate_verdict: unknown) =>
      evaluateGateBlock({ state: PENDING, inputArgs: { gate_verdict } });

    expect(decide("GATE_REVIEW: PASS - ok")).toBeNull();
    expect(decide({ overall: "PASS", rationale: "ok" })).toBeNull();
    expect(decide("GATE_REVIEW: FAIL - broken")).toContain("Gate FAIL");
    expect(decide({ overall: "FAIL", rationale: "broken" })).toContain("Gate FAIL");
    expect(decide({ overall: "fail", rationale: "broken" })).toContain("Gate FAIL");
  });

  it("armed check: legacy string and object give the same decision", () => {
    const decide = (gate_verdict: unknown) =>
      evaluateArmedGateBlock(ARMED, { gate_verdict });

    expect(decide("GATE_REVIEW: PASS - ok")).toBeNull();
    expect(decide({ overall: "PASS", rationale: "ok" })).toBeNull();
    expect(decide("GATE_REVIEW: FAIL - broken")).toContain("FAILED");
    expect(decide({ overall: "FAIL", rationale: "broken" })).toContain("FAILED");
  });

  it("per_gate and reminders on an object verdict do not change the decision", () => {
    const verdict = {
      overall: "PASS",
      rationale: "ok",
      per_gate: [{ index: 0, passed: true, rationale: "fine" }],
      reminders: { satisfied: [0], not_applicable: [] },
    };
    expect(evaluateGateBlock({ state: PENDING, inputArgs: { gate_verdict: verdict } })).toBeNull();
    expect(evaluateArmedGateBlock(ARMED, { gate_verdict: verdict })).toBeNull();
  });
});

describe("malformed verdicts do not crash the readers", () => {
  const MALFORMED: unknown[] = [
    {},
    [],
    [{ overall: "PASS" }],
    { overall: null },
    { overall: 7 },
    { overall: { nested: "PASS" } },
    { rationale: "no overall" },
    "",
    42,
    true,
  ];

  it.each(MALFORMED.map((value) => [JSON.stringify(value), value]))(
    "pending-gate check survives %s",
    (_label, value) => {
      expect(() =>
        evaluateGateBlock({ state: PENDING, inputArgs: { gate_verdict: value } })
      ).not.toThrow();
    }
  );

  it.each(MALFORMED.map((value) => [JSON.stringify(value), value]))(
    "armed check survives %s and does not disarm",
    (_label, value) => {
      let denial: string | null = null;
      expect(() => {
        denial = evaluateArmedGateBlock(ARMED, { gate_verdict: value });
      }).not.toThrow();
      expect(denial).toEqual(expect.stringContaining("require review"));
    }
  );

  it("a null verdict counts as no verdict", () => {
    const denial = evaluateGateBlock({
      state: PENDING,
      inputArgs: { chain_id: "chain-x#1", gate_verdict: null },
    });
    expect(denial).toContain("requires a response");
  });
});
