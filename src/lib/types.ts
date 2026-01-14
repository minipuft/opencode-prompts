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

export interface ChainState {
  chain_id: string;
  current_step: number;
  total_steps: number;
  pending_gate: string | null;
  gate_criteria: string[];
  last_prompt_id: string;
  pending_shell_verify: string | null;
  shell_verify_attempts: number;
}

export interface PromptsCache {
  prompts: Record<string, PromptInfo>;
  version?: string;
  generated_at?: string;
}

export interface GatesCache {
  gates: Record<string, GateInfo>;
}
