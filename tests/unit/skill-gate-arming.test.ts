/**
 * Exported-skill gate enforcement (plan rows 4.1 / 4.2).
 *
 * Arming: a read of an exported skill carrying gates/index.json arms the session.
 * Blocking: while armed-unverdicted every tool is denied; PASS disarms; FAIL escalates.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";

import {
  detectSkillGateArm,
  evaluateArmedGateBlock,
} from "../../src/lib/gate-enforcement.js";
import type { ChainState } from "../../src/lib/types.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ocp-arm-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function seedSkill(skillName: string, manifest: unknown): string {
  const skillPath = join(dir, "skills", skillName);
  mkdirSync(join(skillPath, "gates"), { recursive: true });
  writeFileSync(
    join(skillPath, "gates", "index.json"),
    typeof manifest === "string" ? manifest : JSON.stringify(manifest)
  );
  return join(skillPath, "SKILL.md");
}

const ARMED: ChainState = {
  chain_id: "",
  current_step: 0,
  total_steps: 0,
  pending_gate: null,
  gate_criteria: [],
  last_prompt_id: "",
  pending_shell_verify: null,
  shell_verify_attempts: 0,
  gate_armed: {
    skillPath: "/home/x/.config/opencode/skills/strategicImplement",
    gates: [{ id: "workflow-preflight" }, { id: "plan-quality" }],
    armedAt: new Date().toISOString(),
  },
};

describe("detectSkillGateArm", () => {
  it("arms from a real read of a gated skill", () => {
    const path = seedSkill("my-skill", { skill: "my-skill", gates: [{ id: "g1" }] });
    const arm = detectSkillGateArm("read", { path }, dir);
    expect(arm?.skillPath).toBe(join(dir, "skills", "my-skill"));
    expect(arm?.gates).toEqual([{ id: "g1" }]);
  });

  it("does not arm for non-read tools", () => {
    const path = seedSkill("my-skill", { gates: [{ id: "g1" }] });
    expect(detectSkillGateArm("bash", { command: `cat ${path}` }, dir)).toBeNull();
  });

  it("does not arm for paths outside skills directories", () => {
    const outside = join(dir, "not-skills", "my-skill", "SKILL.md");
    mkdirSync(join(dir, "not-skills", "my-skill"), { recursive: true });
    writeFileSync(outside, "x");
    expect(detectSkillGateArm("read", { path: outside }, dir)).toBeNull();
  });

  it("does not arm when index.json is corrupt or missing", () => {
    const corrupt = seedSkill("corrupt", "{ not json");
    expect(detectSkillGateArm("read", { path: corrupt }, dir)).toBeNull();

    const noManifest = join(dir, "skills", "plain");
    mkdirSync(noManifest, { recursive: true });
    writeFileSync(join(noManifest, "SKILL.md"), "x");
    expect(
      detectSkillGateArm("read", { path: join(noManifest, "SKILL.md") }, dir)
    ).toBeNull();
  });
});

describe("evaluateArmedGateBlock", () => {
  it("blocks an unrelated tool call while armed and unverdicted", () => {
    const denial = evaluateArmedGateBlock(ARMED, { command: "ls" });
    expect(denial).toContain("Exported-skill gates armed");
    expect(denial).toContain("workflow-preflight");
  });

  it("does not block when nothing is armed", () => {
    const unarmed = { ...ARMED, gate_armed: undefined };
    expect(evaluateArmedGateBlock(unarmed, { command: "ls" })).toBeNull();
    expect(evaluateArmedGateBlock(null, { command: "ls" })).toBeNull();
  });

  it("a PASS verdict signals disarm (no denial)", () => {
    expect(
      evaluateArmedGateBlock(ARMED, { gate_verdict: "GATE_REVIEW: PASS - all criteria met" })
    ).toBeNull();
    expect(
      evaluateArmedGateBlock(ARMED, { gate_verdict: { overall: "PASS", rationale: "ok" } })
    ).toBeNull();
  });

  it("a FAIL verdict keeps the gate armed with escalation", () => {
    const denial = evaluateArmedGateBlock(ARMED, {
      gate_verdict: { overall: "FAIL", rationale: "bad" },
    });
    expect(denial).toContain("FAILED");
  });
});
