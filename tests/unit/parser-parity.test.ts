/**
 * Parser parity between the TS plugin and the Python hooks (plan row 3.2).
 *
 * Expected values recorded from hooks/lib/session_state.py parse_prompt_engine_response
 * on the same fixtures (baseline run 2026-08-21, /tmp/opencode/pre_patterns.json).
 */
import { describe, expect, it } from "@jest/globals";

import { parsePromptEngineResponse } from "../../src/lib/session-state.js";

describe("parsePromptEngineResponse parity with Python hooks", () => {
  it("parses 'Step X of Y'", () => {
    const s = parsePromptEngineResponse("Step 1 of 3\nSome content");
    expect(s?.current_step).toBe(1);
    expect(s?.total_steps).toBe(3);
  });

  it("parses 'Progress X/Y'", () => {
    const s = parsePromptEngineResponse("Progress 2/4 - Implementing feature");
    expect(s?.current_step).toBe(2);
    expect(s?.total_steps).toBe(4);
  });

  it("parses 'complete (X/Y)' like the Python [Cc]omplete pattern", () => {
    const s = parsePromptEngineResponse("Chain complete (2/2) done");
    expect(s?.current_step).toBe(2);
    expect(s?.total_steps).toBe(2);
  });

  it("extracts chain-id with hyphen form only", () => {
    const s = parsePromptEngineResponse("Resume token: chain-analyze#2\nStep 2 of 3");
    expect(s?.chain_id).toBe("chain-analyze#2");
  });

  it("does not match chain_id parameter names (Python parity)", () => {
    const s = parsePromptEngineResponse('call prompt_engine(chain_id: "chain-x#1")');
    // 'chain_id' literal must not be captured as a resume token
    expect(s?.chain_id).not.toBe("chain_id");
  });

  it("detects Review Required + Gates list", () => {
    const s = parsePromptEngineResponse(
      "**Review Required**\n\n**Gates**: code-quality, test-coverage\n\nRespond: GATE_REVIEW: PASS|FAIL"
    );
    expect(s?.pending_gate).toBe("code-quality, test-coverage");
  });

  it("detects legacy Structural + Gate header with attempt count", () => {
    const s = parsePromptEngineResponse(
      "**Structural + Gate Review Required** (attempt 2/5)\n\n**Gates**: intent-quality"
    );
    expect(s?.pending_gate).toBe("intent-quality");
    expect(s?.shell_verify_attempts).toBe(2);
  });

  it("does not fire pending_gate on prose merely mentioning Gate", () => {
    const s = parsePromptEngineResponse(
      "The Gate section of the docs explains usage. Step 1 of 2."
    );
    expect(s?.pending_gate).toBeNull();
  });

  it("returns null for plain text without markers", () => {
    expect(parsePromptEngineResponse("No markers here at all.")).toBeNull();
  });
});
