/**
 * Detection logic for existing claude-prompts installations.
 *
 * Checks for:
 * - Claude Code plugin installation (~/.claude/plugins/installed_plugins.json)
 * - Existing hooks in ~/.claude/hooks/hooks.json
 * - OpenCode plugin registration
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/**
 * Status of claude-prompts installation.
 */
export interface InstallationStatus {
  /** Whether claude-prompts is installed as a Claude Code plugin */
  pluginInstalled: boolean;
  /** Whether our hooks are already in ~/.claude/hooks/hooks.json */
  hooksInstalled: boolean;
  /** Whether hooks directory exists at ~/.claude/hooks/claude-prompts/ */
  hooksDirExists: boolean;
  /** Path to installed hooks directory (if exists) */
  hooksPath: string | null;
  /** Details about what was detected */
  details: string[];
}

/**
 * Paths used for detection.
 */
export const DETECTION_PATHS = {
  claudePluginsFile: join(homedir(), ".claude", "plugins", "installed_plugins.json"),
  claudeHooksDir: join(homedir(), ".claude", "hooks"),
  claudeHooksJson: join(homedir(), ".claude", "hooks", "hooks.json"),
  ourHooksDir: join(homedir(), ".claude", "hooks", "claude-prompts"),
} as const;

/**
 * Hook script names we install.
 */
export const OUR_HOOK_SCRIPTS = [
  "prompt-suggest.py",
  "post-prompt-engine.py",
  "pre-compact.py",
] as const;

/**
 * Check if claude-prompts is installed as a Claude Code plugin.
 */
function checkPluginInstalled(): boolean {
  if (!existsSync(DETECTION_PATHS.claudePluginsFile)) {
    return false;
  }

  try {
    const content = readFileSync(DETECTION_PATHS.claudePluginsFile, "utf-8");
    const plugins = JSON.parse(content);

    // Check if claude-prompts is in the plugins list
    // The format is { version: 2, plugins: { "name@marketplace": [...] } }
    if (plugins.plugins) {
      return Object.keys(plugins.plugins).some((key) =>
        key.toLowerCase().includes("claude-prompts")
      );
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Check if our hooks are registered in ~/.claude/hooks/hooks.json.
 */
function checkHooksInstalled(): boolean {
  if (!existsSync(DETECTION_PATHS.claudeHooksJson)) {
    return false;
  }

  try {
    const content = readFileSync(DETECTION_PATHS.claudeHooksJson, "utf-8");
    const hooksConfig = JSON.parse(content);

    // Check if any of our hook scripts are referenced
    const configStr = JSON.stringify(hooksConfig);
    return OUR_HOOK_SCRIPTS.some((script) => configStr.includes(script));
  } catch {
    return false;
  }
}

/**
 * Check if our hooks directory exists.
 */
function checkHooksDirExists(): boolean {
  return existsSync(DETECTION_PATHS.ourHooksDir);
}

/**
 * Detect existing claude-prompts installation.
 *
 * @returns Status object with installation details
 */
export function detectExistingInstallation(): InstallationStatus {
  const details: string[] = [];

  const pluginInstalled = checkPluginInstalled();
  if (pluginInstalled) {
    details.push("Claude Code plugin detected in ~/.claude/plugins/installed_plugins.json");
  }

  const hooksInstalled = checkHooksInstalled();
  if (hooksInstalled) {
    details.push("Hooks registered in ~/.claude/hooks/hooks.json");
  }

  const hooksDirExists = checkHooksDirExists();
  if (hooksDirExists) {
    details.push(`Hooks directory exists at ${DETECTION_PATHS.ourHooksDir}`);
  }

  return {
    pluginInstalled,
    hooksInstalled,
    hooksDirExists,
    hooksPath: hooksDirExists ? DETECTION_PATHS.ourHooksDir : null,
    details,
  };
}

/**
 * Check if hooks.json exists at the global location.
 */
export function hooksJsonExists(): boolean {
  return existsSync(DETECTION_PATHS.claudeHooksJson);
}

/**
 * Get the global hooks directory path.
 */
export function getGlobalHooksDir(): string {
  return DETECTION_PATHS.claudeHooksDir;
}

/**
 * Get our hooks installation path.
 */
export function getOurHooksDir(): string {
  return DETECTION_PATHS.ourHooksDir;
}
