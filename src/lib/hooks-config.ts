/**
 * Legacy Claude Code hook cleanup for OpenCode prompts.
 *
 * OpenCode never reads ~/.claude/hooks/hooks.json or .claude/settings.json —
 * enforcement lives entirely in the OpenCode plugin API (.opencode/plugin/index.ts).
 * This module exists only so `opencode-prompts uninstall` can remove hook files
 * written by older versions of the installer.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/**
 * Patterns used to identify our hooks for uninstall.
 */
export const HOOK_PATTERNS = [
  "opencode-prompts",
  "prompt-suggest.py",
  "post-prompt-engine.py",
  "pre-compact.py",
] as const;

/**
 * Single hook entry in a hooks array.
 */
export interface HookEntry {
  type: "command";
  command: string;
}

/**
 * Configuration for a hook event (matcher + hooks array).
 */
export interface HookConfig {
  matcher: string;
  hooks: HookEntry[];
}

/**
 * Claude hooks configuration by event type.
 */
export interface ClaudeHooksConfig {
  UserPromptSubmit?: HookConfig[];
  PostToolUse?: HookConfig[];
  PreCompact?: HookConfig[];
}

/**
 * Full Claude settings.json structure.
 */
export interface ClaudeSettings {
  $comment?: string | string[];
  hooks?: ClaudeHooksConfig;
  [key: string]: unknown;
}

/**
 * Result of a hook operation (uninstall).
 */
export interface HookOperationResult {
  success: boolean;
  message: string;
  created?: boolean;
  merged?: boolean;
  removed?: number;
  backupPath?: string;
}

/**
 * Check if a hook command matches our patterns.
 */
export function isOurHook(command: string): boolean {
  return HOOK_PATTERNS.some((pattern) => command.includes(pattern));
}

/**
 * Check if hooks are already installed for a hook event.
 */
export function hasOurHooks(hookConfigs: HookConfig[] | undefined): boolean {
  if (!hookConfigs) return false;
  return hookConfigs.some((config) =>
    config.hooks?.some((hook) => isOurHook(hook.command))
  );
}

/**
 * Filter out our hooks from a hooks array.
 */
export function filterOurHooks(hookConfigs: HookConfig[]): HookConfig[] {
  return hookConfigs
    .map((config) => ({
      ...config,
      hooks: config.hooks.filter((hook) => !isOurHook(hook.command)),
    }))
    .filter((config) => config.hooks.length > 0);
}

/**
 * Read Claude settings from .claude/settings.json.
 */
export function readClaudeSettings(projectDir: string): ClaudeSettings | null {
  const settingsPath = join(projectDir, ".claude", "settings.json");

  if (!existsSync(settingsPath)) {
    return null;
  }

  try {
    const content = readFileSync(settingsPath, "utf-8");
    return JSON.parse(content) as ClaudeSettings;
  } catch {
    return null;
  }
}

/**
 * Write Claude settings to .claude/settings.json.
 */
export function writeClaudeSettings(
  projectDir: string,
  settings: ClaudeSettings
): void {
  const claudeDir = join(projectDir, ".claude");
  const settingsPath = join(claudeDir, "settings.json");

  if (!existsSync(claudeDir)) {
    mkdirSync(claudeDir, { recursive: true });
  }

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
}

/**
 * Create a backup of the settings file.
 */
export function backupClaudeSettings(projectDir: string): string | null {
  const settingsPath = join(projectDir, ".claude", "settings.json");

  if (!existsSync(settingsPath)) {
    return null;
  }

  const backupPath = join(projectDir, ".claude", "settings.json.backup");
  try {
    copyFileSync(settingsPath, backupPath);
    return backupPath;
  } catch {
    return null;
  }
}

/**
 * Uninstall hooks from .claude/settings.json.
 *
 * - Creates backup before modification
 * - Removes only our hooks (preserves other hooks)
 * - Cleans up empty event arrays
 */
export function uninstallHooks(projectDir: string): HookOperationResult {
  const existing = readClaudeSettings(projectDir);

  if (!existing) {
    return {
      success: true,
      message: "No .claude/settings.json found, nothing to uninstall",
    };
  }

  if (!existing.hooks || !hasOurHooks(existing.hooks.UserPromptSubmit)) {
    return {
      success: true,
      message: "Hooks not installed, nothing to uninstall",
    };
  }

  // Create backup
  const backupPath = backupClaudeSettings(projectDir);

  // Count hooks before removal
  let removedCount = 0;

  // Filter out our hooks from each event type
  const hookEvents: (keyof ClaudeHooksConfig)[] = [
    "UserPromptSubmit",
    "PostToolUse",
    "PreCompact",
  ];

  for (const event of hookEvents) {
    const eventHooks = existing.hooks[event];
    if (eventHooks) {
      const originalCount = eventHooks.flatMap((c) => c.hooks).length;
      const filtered = filterOurHooks(eventHooks);
      const filteredCount = filtered.flatMap((c) => c.hooks).length;

      removedCount += originalCount - filteredCount;

      if (filtered.length > 0) {
        existing.hooks[event] = filtered;
      } else {
        delete existing.hooks[event];
      }
    }
  }

  // Clean up empty hooks object
  if (Object.keys(existing.hooks).length === 0) {
    delete existing.hooks;
  }

  // Write updated settings
  writeClaudeSettings(projectDir, existing);

  return {
    success: true,
    message: `Removed ${removedCount} hook(s) from .claude/settings.json`,
    removed: removedCount,
    backupPath: backupPath ?? undefined,
  };
}

// =============================================================================
// Global Hooks Cleanup (~/.claude/hooks/)
// =============================================================================

/**
 * Global hook configuration (for ~/.claude/hooks/hooks.json).
 */
export interface GlobalHookConfig {
  matcher?: string;
  hooks: HookEntry[];
}

/**
 * Full global hooks.json structure.
 */
export interface GlobalHooksJson {
  hooks: {
    SessionStart?: GlobalHookConfig[];
    UserPromptSubmit?: GlobalHookConfig[];
    PostToolUse?: GlobalHookConfig[];
    PreCompact?: GlobalHookConfig[];
    Stop?: GlobalHookConfig[];
    PreToolUse?: GlobalHookConfig[];
    [key: string]: GlobalHookConfig[] | undefined;
  };
}

/**
 * Get global paths for legacy hooks.
 */
export function getGlobalPaths() {
  const claudeDir = join(homedir(), ".claude");
  const hooksDir = join(claudeDir, "hooks");
  const ourHooksDir = join(hooksDir, "claude-prompts");
  const hooksJsonPath = join(hooksDir, "hooks.json");

  return { claudeDir, hooksDir, ourHooksDir, hooksJsonPath };
}

/**
 * Read global hooks.json.
 */
export function readGlobalHooksJson(): GlobalHooksJson | null {
  const { hooksJsonPath } = getGlobalPaths();

  if (!existsSync(hooksJsonPath)) {
    return null;
  }

  try {
    const content = readFileSync(hooksJsonPath, "utf-8");
    return JSON.parse(content) as GlobalHooksJson;
  } catch {
    return null;
  }
}

/**
 * Write global hooks.json.
 */
export function writeGlobalHooksJson(config: GlobalHooksJson): void {
  const { hooksDir, hooksJsonPath } = getGlobalPaths();

  mkdirSync(hooksDir, { recursive: true });
  writeFileSync(hooksJsonPath, JSON.stringify(config, null, 2) + "\n");
}

/**
 * Check if our hooks are in global hooks.json.
 */
export function hasGlobalHooks(): boolean {
  const existing = readGlobalHooksJson();
  if (!existing?.hooks) return false;

  const configStr = JSON.stringify(existing);
  return HOOK_PATTERNS.some((pattern) => configStr.includes(pattern));
}

/**
 * Remove our hooks from global hooks.json.
 */
export function removeFromGlobalHooksJson(): HookOperationResult {
  const existing = readGlobalHooksJson();

  if (!existing) {
    return {
      success: true,
      message: "No ~/.claude/hooks/hooks.json found",
    };
  }

  if (!hasGlobalHooks()) {
    return {
      success: true,
      message: "Our hooks not found in ~/.claude/hooks/hooks.json",
    };
  }

  let removedCount = 0;
  const hookEvents = Object.keys(existing.hooks) as (keyof GlobalHooksJson["hooks"])[];
  const { hooksJsonPath } = getGlobalPaths();

  for (const event of hookEvents) {
    const eventHooks = existing.hooks[event];
    if (!eventHooks) continue;

    const originalCount = eventHooks.length;
    const filtered = eventHooks.filter((config) => {
      const hasOurs = config.hooks?.some((hook) => isOurHook(hook.command));
      return !hasOurs;
    });

    removedCount += originalCount - filtered.length;

    if (filtered.length > 0) {
      existing.hooks[event] = filtered;
    } else {
      delete existing.hooks[event];
    }
  }

  writeFileSync(hooksJsonPath, JSON.stringify(existing, null, 2) + "\n");

  return {
    success: true,
    message: `Removed ${removedCount} hook configuration(s) from ~/.claude/hooks/hooks.json`,
    removed: removedCount,
  };
}

/**
 * Remove our hooks directory from global location.
 */
export function removeGlobalHooksDir(): HookOperationResult {
  const { ourHooksDir } = getGlobalPaths();

  if (!existsSync(ourHooksDir)) {
    return {
      success: true,
      message: "Hooks directory does not exist",
    };
  }

  try {
    rmSync(ourHooksDir, { recursive: true, force: true });
    return {
      success: true,
      message: `Removed ${ourHooksDir}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to remove hooks directory: ${error}`,
    };
  }
}

/**
 * Uninstall legacy hooks globally.
 *
 * 1. Remove from ~/.claude/hooks/hooks.json
 * 2. Remove ~/.claude/hooks/claude-prompts/
 */
export function uninstallGlobalHooks(): HookOperationResult {
  // Step 1: Remove from hooks.json
  const removeJsonResult = removeFromGlobalHooksJson();

  // Step 2: Remove hooks directory
  const removeDirResult = removeGlobalHooksDir();

  const totalRemoved = (removeJsonResult.removed ?? 0);

  return {
    success: removeJsonResult.success && removeDirResult.success,
    message: `${removeJsonResult.message}; ${removeDirResult.message}`,
    removed: totalRemoved,
  };
}

// =============================================================================
// Project-Level Legacy Hooks Cleanup (./.claude/hooks/)
// =============================================================================

/**
 * Get project-level paths for legacy hooks.
 */
export function getProjectPaths(projectDir: string) {
  const claudeDir = join(projectDir, ".claude");
  const hooksDir = join(claudeDir, "hooks");
  const ourHooksDir = join(hooksDir, "claude-prompts");
  const hooksJsonPath = join(hooksDir, "hooks.json");

  return { claudeDir, hooksDir, ourHooksDir, hooksJsonPath };
}

/**
 * Read project-level hooks.json.
 */
export function readProjectHooksJson(projectDir: string): GlobalHooksJson | null {
  const { hooksJsonPath } = getProjectPaths(projectDir);

  if (!existsSync(hooksJsonPath)) {
    return null;
  }

  try {
    const content = readFileSync(hooksJsonPath, "utf-8");
    return JSON.parse(content) as GlobalHooksJson;
  } catch {
    return null;
  }
}

/**
 * Check if our hooks are in project hooks.json.
 */
export function hasProjectHooks(projectDir: string): boolean {
  const existing = readProjectHooksJson(projectDir);
  if (!existing?.hooks) return false;

  const configStr = JSON.stringify(existing);
  return HOOK_PATTERNS.some((pattern) => configStr.includes(pattern));
}

/**
 * Uninstall legacy hooks from project directory.
 */
export function uninstallProjectHooks(projectDir: string): HookOperationResult {
  const { ourHooksDir, hooksJsonPath } = getProjectPaths(projectDir);
  let removedCount = 0;

  // Remove from hooks.json
  const existing = readProjectHooksJson(projectDir);
  if (existing && hasProjectHooks(projectDir)) {
    const hookEvents = Object.keys(existing.hooks) as (keyof GlobalHooksJson["hooks"])[];

    for (const event of hookEvents) {
      const eventHooks = existing.hooks[event];
      if (!eventHooks) continue;

      const originalCount = eventHooks.length;
      const filtered = eventHooks.filter((config) => {
        const hasOurs = config.hooks?.some((hook) => isOurHook(hook.command));
        return !hasOurs;
      });

      removedCount += originalCount - filtered.length;

      if (filtered.length > 0) {
        existing.hooks[event] = filtered;
      } else {
        delete existing.hooks[event];
      }
    }

    writeFileSync(hooksJsonPath, JSON.stringify(existing, null, 2) + "\n");
  }

  // Remove hooks directory
  if (existsSync(ourHooksDir)) {
    try {
      rmSync(ourHooksDir, { recursive: true, force: true });
    } catch {
      // Ignore errors
    }
  }

  return {
    success: true,
    message: `Removed ${removedCount} hook(s) from project`,
    removed: removedCount,
  };
}
