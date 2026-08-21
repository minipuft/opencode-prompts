/**
 * Shared type definitions for OpenCode prompts plugin.
 */

export interface ArgumentInfo {
  name: string;
  type: string;
  required: boolean;
  description: string;
  default?: string | null;
}

export interface PromptInfo {
  id: string;
  name: string;
  category: string;
  description: string;
  is_chain: boolean;
  chain_steps: number;
  arguments: ArgumentInfo[];
  gates: string[];
  keywords: string[];
}

export interface GateInfo {
  id: string;
  name: string;
  type: string;
  description: string;
  triggers: string[];
}

/**
 * An armed exported-skill gate: the agent read a skill whose gates/ directory
 * declares mechanical review criteria, so further tool calls are blocked until
 * a GATE_REVIEW verdict clears it (plan row 4.1/4.2).
 */
export interface GateArmedState {
  /** Absolute path of the exported skill directory that armed the gate. */
  skillPath: string;
  gates: Array<{ id: string; criteria?: unknown[] }>;
  armedAt: string;
}

export interface ChainState {
  chain_id: string;
  current_step: number;
  total_steps: number;
  pending_gate: string | null;
  gate_criteria: string[];
  last_prompt_id: string;
  pending_shell_verify: string | null;
  shell_verify_attempts: number;
  gate_armed?: GateArmedState;
}

export interface PromptsCache {
  prompts: Record<string, PromptInfo>;
  version?: string;
  generated_at?: string;
}

export interface GatesCache {
  gates: Record<string, GateInfo>;
}
