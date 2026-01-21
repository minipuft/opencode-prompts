/**
 * Shared hooks configuration for OpenCode prompts.
 *
 * Provides types and utilities for managing Claude hooks in .claude/settings.json.
 * Used by both the OpenCode plugin (auto-setup) and CLI commands (install/uninstall).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, cpSync, rmSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { homedir } from "node:os";

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
 * Hooks are located in the claude-prompts npm package (our dependency).
 *
 * @param projectDir - Project root directory
 * @param pluginDir - Plugin installation directory (optional, for OpenCode plugin context)
 */
export function getHooksDir(projectDir: string, pluginDir?: string): string {
  // Hooks are in claude-prompts package (our dependency)
  // Check node_modules/claude-prompts/hooks first
  const claudePromptsHooksDir = join("node_modules", "claude-prompts", "hooks");
  if (existsSync(join(projectDir, claudePromptsHooksDir))) {
    return claudePromptsHooksDir;
  }

  // Legacy: pluginDir context (OpenCode plugin with old structure)
  if (pluginDir) {
    const legacyHooksDir = join(pluginDir, "core", "hooks");
    if (existsSync(legacyHooksDir)) {
      return relative(projectDir, legacyHooksDir);
    }
  }

  // Fallback to claude-prompts location (will exist after npm install)
  return claudePromptsHooksDir;
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

// =============================================================================
// Global Hooks Management (~/.claude/hooks/)
// =============================================================================

/**
 * Extended hook entry with additional metadata.
 */
export interface GlobalHookEntry {
  type: "command";
  command: string;
  name?: string;
  timeout?: number;
}

/**
 * Global hook configuration (for ~/.claude/hooks/hooks.json).
 */
export interface GlobalHookConfig {
  matcher?: string;
  hooks: GlobalHookEntry[];
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
 * Get global paths for hooks.
 */
export function getGlobalPaths() {
  const claudeDir = join(homedir(), ".claude");
  const hooksDir = join(claudeDir, "hooks");
  const ourHooksDir = join(hooksDir, "claude-prompts");
  const hooksJsonPath = join(hooksDir, "hooks.json");

  return { claudeDir, hooksDir, ourHooksDir, hooksJsonPath };
}

/**
 * Find hooks source directory in node_modules.
 */
export function findHooksSource(projectDir: string): string | null {
  // Primary: node_modules/claude-prompts/hooks
  const nmPath = join(projectDir, "node_modules", "claude-prompts", "hooks");
  if (existsSync(nmPath)) {
    return nmPath;
  }

  // Check parent directories for monorepo setups
  let current = projectDir;
  for (let i = 0; i < 5; i++) {
    const parent = join(current, "..");
    const parentNmPath = join(parent, "node_modules", "claude-prompts", "hooks");
    if (existsSync(parentNmPath)) {
      return parentNmPath;
    }
    current = parent;
  }

  return null;
}

/**
 * Copy hooks to global location (~/.claude/hooks/claude-prompts/).
 */
export function copyHooksToGlobal(projectDir: string): HookOperationResult {
  const source = findHooksSource(projectDir);
  if (!source) {
    return {
      success: false,
      message: "Could not find hooks source in node_modules/claude-prompts/hooks",
    };
  }

  const { hooksDir, ourHooksDir } = getGlobalPaths();

  try {
    // Ensure directories exist
    mkdirSync(hooksDir, { recursive: true });

    // Copy hooks directory (recursive)
    cpSync(source, ourHooksDir, { recursive: true });

    return {
      success: true,
      message: `Copied hooks to ${ourHooksDir}`,
      created: true,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to copy hooks: ${error}`,
    };
  }
}

/**
 * Generate global hooks configuration with absolute paths.
 */
export function generateGlobalHooksConfig(): GlobalHooksJson {
  const { ourHooksDir } = getGlobalPaths();

  return {
    hooks: {
      UserPromptSubmit: [
        {
          matcher: "*",
          hooks: [
            {
              type: "command",
              command: `python3 ${ourHooksDir}/prompt-suggest.py`,
              name: "prompt-suggest",
              timeout: 5,
            },
          ],
        },
      ],
      PostToolUse: [
        {
          matcher: "prompt_engine",
          hooks: [
            {
              type: "command",
              command: `python3 ${ourHooksDir}/post-prompt-engine.py`,
              name: "chain-tracker",
              timeout: 5,
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
              command: `python3 ${ourHooksDir}/pre-compact.py`,
              name: "pre-compact",
              timeout: 5,
            },
          ],
        },
      ],
    },
  };
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
 * Merge our hooks into global hooks.json.
 */
export function mergeIntoGlobalHooksJson(): HookOperationResult {
  const ourHooks = generateGlobalHooksConfig();
  const existing = readGlobalHooksJson();

  if (existing && hasGlobalHooks()) {
    return {
      success: true,
      message: "Hooks already registered in ~/.claude/hooks/hooks.json",
    };
  }

  if (existing) {
    // Merge with existing hooks
    for (const [event, hooks] of Object.entries(ourHooks.hooks)) {
      const existingHooks = existing.hooks[event] ?? [];
      existing.hooks[event] = [...existingHooks, ...(hooks ?? [])];
    }

    writeGlobalHooksJson(existing);
    return {
      success: true,
      message: "Merged hooks into existing ~/.claude/hooks/hooks.json",
      merged: true,
    };
  }

  // Create new hooks.json
  writeGlobalHooksJson(ourHooks);
  return {
    success: true,
    message: "Created ~/.claude/hooks/hooks.json with our hooks",
    created: true,
  };
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

  writeGlobalHooksJson(existing);

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
 * Install hooks globally.
 *
 * 1. Copy hooks to ~/.claude/hooks/claude-prompts/
 * 2. Merge into ~/.claude/hooks/hooks.json
 */
export function installGlobalHooks(projectDir: string): HookOperationResult {
  // Step 1: Copy hooks
  const copyResult = copyHooksToGlobal(projectDir);
  if (!copyResult.success) {
    return copyResult;
  }

  // Step 2: Merge into hooks.json
  const mergeResult = mergeIntoGlobalHooksJson();
  if (!mergeResult.success) {
    return mergeResult;
  }

  return {
    success: true,
    message: `${copyResult.message}; ${mergeResult.message}`,
    created: copyResult.created || mergeResult.created,
    merged: mergeResult.merged,
  };
}

/**
 * Uninstall hooks globally.
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
// Project-Level Hooks (./.claude/hooks/)
// =============================================================================

/**
 * Get project-level paths for hooks.
 */
export function getProjectPaths(projectDir: string) {
  const claudeDir = join(projectDir, ".claude");
  const hooksDir = join(claudeDir, "hooks");
  const ourHooksDir = join(hooksDir, "claude-prompts");
  const hooksJsonPath = join(hooksDir, "hooks.json");

  return { claudeDir, hooksDir, ourHooksDir, hooksJsonPath };
}

/**
 * Copy hooks to project location (./.claude/hooks/claude-prompts/).
 */
export function copyHooksToProject(projectDir: string): HookOperationResult {
  const source = findHooksSource(projectDir);
  if (!source) {
    return {
      success: false,
      message: "Could not find hooks source in node_modules/claude-prompts/hooks",
    };
  }

  const { hooksDir, ourHooksDir } = getProjectPaths(projectDir);

  try {
    mkdirSync(hooksDir, { recursive: true });
    cpSync(source, ourHooksDir, { recursive: true });

    return {
      success: true,
      message: `Copied hooks to ${ourHooksDir}`,
      created: true,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to copy hooks: ${error}`,
    };
  }
}

/**
 * Generate project-level hooks configuration.
 */
export function generateProjectHooksConfig(projectDir: string): GlobalHooksJson {
  const { ourHooksDir } = getProjectPaths(projectDir);

  return {
    hooks: {
      UserPromptSubmit: [
        {
          matcher: "*",
          hooks: [
            {
              type: "command",
              command: `python3 ${ourHooksDir}/prompt-suggest.py`,
              name: "prompt-suggest",
              timeout: 5,
            },
          ],
        },
      ],
      PostToolUse: [
        {
          matcher: "prompt_engine",
          hooks: [
            {
              type: "command",
              command: `python3 ${ourHooksDir}/post-prompt-engine.py`,
              name: "chain-tracker",
              timeout: 5,
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
              command: `python3 ${ourHooksDir}/pre-compact.py`,
              name: "pre-compact",
              timeout: 5,
            },
          ],
        },
      ],
    },
  };
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
 * Write project-level hooks.json.
 */
export function writeProjectHooksJson(projectDir: string, config: GlobalHooksJson): void {
  const { hooksDir, hooksJsonPath } = getProjectPaths(projectDir);

  mkdirSync(hooksDir, { recursive: true });
  writeFileSync(hooksJsonPath, JSON.stringify(config, null, 2) + "\n");
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
 * Merge our hooks into project hooks.json.
 */
export function mergeIntoProjectHooksJson(projectDir: string): HookOperationResult {
  const ourHooks = generateProjectHooksConfig(projectDir);
  const existing = readProjectHooksJson(projectDir);

  if (existing && hasProjectHooks(projectDir)) {
    return {
      success: true,
      message: "Hooks already registered in project hooks.json",
    };
  }

  if (existing) {
    for (const [event, hooks] of Object.entries(ourHooks.hooks)) {
      const existingHooks = existing.hooks[event] ?? [];
      existing.hooks[event] = [...existingHooks, ...(hooks ?? [])];
    }

    writeProjectHooksJson(projectDir, existing);
    return {
      success: true,
      message: "Merged hooks into existing project hooks.json",
      merged: true,
    };
  }

  writeProjectHooksJson(projectDir, ourHooks);
  return {
    success: true,
    message: "Created project hooks.json with our hooks",
    created: true,
  };
}

/**
 * Install hooks to project directory.
 *
 * 1. Copy hooks to ./.claude/hooks/claude-prompts/
 * 2. Merge into ./.claude/hooks/hooks.json
 */
export function installProjectHooks(projectDir: string): HookOperationResult {
  const copyResult = copyHooksToProject(projectDir);
  if (!copyResult.success) {
    return copyResult;
  }

  const mergeResult = mergeIntoProjectHooksJson(projectDir);
  if (!mergeResult.success) {
    return mergeResult;
  }

  return {
    success: true,
    message: `${copyResult.message}; ${mergeResult.message}`,
    created: copyResult.created || mergeResult.created,
    merged: mergeResult.merged,
  };
}

/**
 * Uninstall hooks from project directory.
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

    writeProjectHooksJson(projectDir, existing);
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
