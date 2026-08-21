/**
 * Gate enforcement decision logic for the OpenCode plugin.
 *
 * Mirrors upstream hooks/gate-enforce.py semantics:
 * - FAIL verdicts (string or structured {overall}) block prompt_engine calls
 * - a pending gate blocks verdict-less chain resumes UNLESS the call carries a
 *   generated resolution verb (gate_action / gate_verdict / cancel)
 *
 * Resolution verbs load from the bundled claude-prompts package's generated
 * contract (hooks/lib/_generated/resolution-verbs.json). Fail-open: a missing or
 * unreadable artifact degrades to no-verb-acceptance rather than crashing the hook.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ChainState, GateArmedState } from "./types.js";

let cachedVerbs: string[] | null = null;

/** Reset the verb cache — tests only. */
export function resetVerbCache(): void {
  cachedVerbs = null;
}

/**
 * Load generated resolution verbs. Candidates: MCP_WORKSPACE, this package's own
 * node_modules (bundled claude-prompts), then the project dir's node_modules.
 * Returns [] when nothing resolvable — callers treat that as "no verbs accepted".
 */
export function loadResolutionVerbs(projectDir?: string): string[] {
  if (cachedVerbs) return cachedVerbs;
  const rel = join("hooks", "lib", "_generated", "resolution-verbs.json");
  const candidates: string[] = [];
  const mcpWorkspace = process.env.MCP_WORKSPACE;
  if (mcpWorkspace) candidates.push(join(mcpWorkspace, rel));
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    // dist/src/lib -> dist -> package root; src/lib -> src -> repo root
    candidates.push(resolve(here, "..", "..", "node_modules", "claude-prompts", rel));
    candidates.push(resolve(here, "..", "..", "..", "node_modules", "claude-prompts", rel));
  } catch {
    // import.meta.url unavailable in some contexts
  }
  if (projectDir) candidates.push(join(projectDir, "node_modules", "claude-prompts", rel));

  for (const candidate of candidates) {
    try {
      if (!existsSync(candidate)) continue;
      const parsed: unknown = JSON.parse(readFileSync(candidate, "utf-8"));
      if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) {
        cachedVerbs = parsed as string[];
        return cachedVerbs;
      }
    } catch {
      // try next candidate
    }
  }
  return [];
}

export interface GateBlockInput {
  state: ChainState | null;
  inputArgs?: Record<string, unknown>;
  outputArgs?: Record<string, unknown>;
}

/**
 * Decide whether a prompt_engine call must be blocked.
 * @returns denial message, or null when the call may proceed.
 */
export function evaluateGateBlock({ state, inputArgs, outputArgs }: GateBlockInput): string | null {
  if (!state?.pending_gate) return null;

  const merged: Record<string, unknown> = { ...(inputArgs ?? {}), ...(outputArgs ?? {}) };
  const verdict = merged.gate_verdict;

  // Structured verdict object: { overall: "PASS" | "FAIL", rationale }
  if (verdict !== undefined && verdict !== null && typeof verdict === "object") {
    const overall = String((verdict as Record<string, unknown>).overall ?? "").toUpperCase();
    if (overall === "FAIL") {
      return `Gate FAIL (structured verdict). Fix the issues and retry with GATE_REVIEW: PASS - <reason>.`;
    }
    return null; // structured PASS or unknown shape clears the gate check
  }

  // String verdict: FAIL blocks; anything else counts as a response.
  if (typeof verdict === "string") {
    if (verdict.toUpperCase().includes("FAIL")) {
      return `Gate FAIL: "${verdict}". Fix the issues and retry with GATE_REVIEW: PASS - <reason>.`;
    }
    return null;
  }

  // Verdict-less resume: allowed only when a resolution verb is carried.
  const verbs = loadResolutionVerbs();
  const carriesVerb = verbs.some((verb) => {
    const value = merged[verb];
    return value !== undefined && value !== null && value !== "";
  });
  if (carriesVerb) return null;

  const chainId = merged.chain_id;
  if (chainId) {
    return (
      `Gate "${state.pending_gate}" requires a response. ` +
      `Respond with: GATE_REVIEW: PASS|FAIL - <reason>`
    );
  }
  return null;
}

// =============================================================================
// Exported-skill gate arming (plan rows 4.1 / 4.2)
// =============================================================================

export interface SkillGateArm {
  skillPath: string;
  gates: Array<{ id: string; criteria?: unknown[] }>;
}

/** Read-type tools whose execution may surface an exported skill's instructions. */
export function isReadTool(tool: string): boolean {
  return /read|view/i.test(tool);
}

function extractPathArg(args?: Record<string, unknown>): string | null {
  for (const key of ["path", "file_path", "filePath", "file"]) {
    const value = args?.[key];
    if (typeof value === "string" && value) return value;
  }
  return null;
}

/**
 * Detect a read of an exported skill that ships mechanical gates.
 *
 * Fires when a read-type tool targets a path inside an OpenCode skills directory
 * (`.../skills/<name>/...`) whose skill folder carries `gates/index.json` — the
 * manifest the upstream exporter emits beside every gated SKILL.md. Fail-open:
 * any resolution/parse error returns null and nothing arms.
 */
export function detectSkillGateArm(
  tool: string,
  args: Record<string, unknown> | undefined,
  projectDir?: string
): SkillGateArm | null {
  if (!isReadTool(tool)) return null;
  const rawPath = extractPathArg(args);
  if (!rawPath) return null;

  const absolute = rawPath.startsWith("/")
    ? rawPath
    : projectDir
      ? join(projectDir, rawPath)
      : resolve(rawPath);

  const marker = "/skills/";
  const markerIdx = absolute.indexOf(marker);
  if (markerIdx === -1) return null;
  const skillsRoot = absolute.slice(0, markerIdx + marker.length - 1);
  const rest = absolute.slice(markerIdx + marker.length);
  const skillName = rest.split("/")[0] ?? "";
  if (!skillName) return null;

  const skillPath = join(skillsRoot, skillName);
  const manifestPath = join(skillPath, "gates", "index.json");
  try {
    if (!existsSync(manifestPath)) return null;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
      gates?: unknown;
    };
    if (!Array.isArray(manifest.gates)) return null;
    const gates = manifest.gates
      .filter((g): g is { id: string; criteria?: unknown[] } => {
        return typeof g === "object" && g !== null && typeof (g as { id?: unknown }).id === "string";
      })
      .map((g) => ({ id: g.id, ...(Array.isArray(g.criteria) ? { criteria: g.criteria } : {}) }));
    if (gates.length === 0) return null;
    return { skillPath, gates };
  } catch {
    return null;
  }
}

/**
 * Enforcement for an armed exported-skill gate: block EVERY tool call until a
 * GATE_REVIEW verdict clears it. A PASS verdict disarms; FAIL keeps the gate
 * armed with an escalation message. OQ-1 ruling: hard block, fail-open on state errors.
 *
 * @returns denial message, or null when the call may proceed.
 */
export function evaluateArmedGateBlock(
  state: ChainState | null,
  inputArgs?: Record<string, unknown>,
  outputArgs?: Record<string, unknown>
): string | null {
  const armed = state?.gate_armed;
  if (!armed) return null;

  const merged: Record<string, unknown> = { ...(inputArgs ?? {}), ...(outputArgs ?? {}) };
  const verdict = merged.gate_verdict;
  const gateNames = armed.gates.map((g) => g.id).join(", ");

  let overall: string | null = null;
  if (typeof verdict === "string") {
    if (verdict.toUpperCase().includes("PASS")) overall = "PASS";
    else if (verdict.toUpperCase().includes("FAIL")) overall = "FAIL";
  } else if (verdict && typeof verdict === "object") {
    overall = String((verdict as Record<string, unknown>).overall ?? "").toUpperCase();
  }

  if (overall === "PASS") return null; // caller disarms on this signal
  if (overall === "FAIL") {
    return (
      `Gate review FAILED for exported-skill gates [${gateNames}]. ` +
      `Fix the issues and respond with GATE_REVIEW: PASS - <reason> to clear.`
    );
  }
  return (
    `Exported-skill gates armed from ${armed.skillPath} [${gateNames}] require review. ` +
    `Respond with GATE_REVIEW: PASS|FAIL - <reason> before running further tools.`
  );
}

/** Build the disarm signal shape: the armed field removed from session state. */
export function disarmGate(state: ChainState): ChainState {
  const next = { ...state };
  delete next.gate_armed;
  return next;
}
