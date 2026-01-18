/**
 * Shared hooks configuration for OpenCode prompts.
 *
 * Provides types and utilities for managing Claude hooks in .claude/settings.json.
 * Used by both the OpenCode plugin (auto-setup) and CLI commands (install/uninstall).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Patterns used to identify our hooks for install/uninstall.
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
 * Result of a hook operation (install/uninstall).
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
 * Generate hook configuration for opencode-prompts.
 *
 * @param hooksDir - Relative path from project root to the hooks directory
 */
export function generateHooksConfig(hooksDir: string): ClaudeHooksConfig {
  return {
    UserPromptSubmit: [
      {
        matcher: "*",
        hooks: [
          {
            type: "command",
            command: `python3 ${hooksDir}/prompt-suggest.py`,
          },
        ],
      },
    ],
    PostToolUse: [
      {
        matcher: "*prompt_engine*",
        hooks: [
          {
            type: "command",
            command: `python3 ${hooksDir}/post-prompt-engine.py`,
          },
        ],
      },
    ],
    PreCompact: [
      {
        matcher: "*",
        hooks: [
          {
            type: "command",
            command: `python3 ${hooksDir}/pre-compact.py`,
          },
        ],
      },
    ],
  };
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
 * Merge our hooks into existing hooks config (preserves existing hooks).
 */
export function mergeHooksConfig(
  existing: ClaudeHooksConfig | undefined,
  ourHooks: ClaudeHooksConfig
): ClaudeHooksConfig {
  const merged: ClaudeHooksConfig = { ...existing };

  for (const [event, hooks] of Object.entries(ourHooks)) {
    const eventKey = event as keyof ClaudeHooksConfig;
    merged[eventKey] = [...(merged[eventKey] ?? []), ...(hooks ?? [])];
  }

  return merged;
}

/**
 * Get the hooks directory path for this package.
 *
 * @param projectDir - Project root directory
 * @param pluginDir - Plugin installation directory (optional, for OpenCode plugin context)
 */
export function getHooksDir(projectDir: string, pluginDir?: string): string {
  if (pluginDir) {
    // OpenCode plugin context: use relative path from project to plugin
    const hooksDir = join(pluginDir, "core", "hooks");
    return relative(projectDir, hooksDir);
  }

  // CLI context: detect installation location
  // Try npm global/local install first (node_modules)
  const npmHooksDir = join("node_modules", "opencode-prompts", "core", "hooks");
  if (existsSync(join(projectDir, npmHooksDir))) {
    return npmHooksDir;
  }

  // Try .opencode/plugin location
  const pluginHooksDir = join(".opencode", "plugin", "opencode-prompts", "core", "hooks");
  if (existsSync(join(projectDir, pluginHooksDir))) {
    return pluginHooksDir;
  }

  // Fallback to npm location (will be created on install)
  return npmHooksDir;
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
 * Install hooks into .claude/settings.json.
 *
 * - Creates file if it doesn't exist
 * - Merges hooks if file exists (preserves existing hooks)
 * - Idempotent: skips if already installed
 */
export function installHooks(
  projectDir: string,
  pluginDir?: string
): HookOperationResult {
  const hooksDir = getHooksDir(projectDir, pluginDir);
  const ourHooks = generateHooksConfig(hooksDir);

  const existing = readClaudeSettings(projectDir);

  if (existing) {
    // Check if already installed
    if (hasOurHooks(existing.hooks?.UserPromptSubmit)) {
      return {
        success: true,
        message: "Hooks already installed",
      };
    }

    // Merge hooks
    existing.hooks = mergeHooksConfig(existing.hooks, ourHooks);
    writeClaudeSettings(projectDir, existing);

    return {
      success: true,
      message: "Hooks added to existing .claude/settings.json",
      merged: true,
    };
  }

  // Create new settings file
  const settings: ClaudeSettings = {
    $comment: "Auto-generated by opencode-prompts for oh-my-opencode integration",
    hooks: ourHooks,
  };

  writeClaudeSettings(projectDir, settings);

  return {
    success: true,
    message: "Created .claude/settings.json with hooks",
    created: true,
  };
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
