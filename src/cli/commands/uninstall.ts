/**
 * Uninstall command for opencode-prompts CLI.
 *
 * Removes Claude hooks from .claude/settings.json while preserving other hooks.
 * Creates a backup before modification for safety.
 */

import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { uninstallHooks, readClaudeSettings } from "../../lib/hooks-config.js";

/**
 * Uninstall hooks from the current project.
 */
export async function uninstall(args: string[]): Promise<void> {
  // Check for help flag
  if (args.includes("--help") || args.includes("-h")) {
    showUninstallHelp();
    return;
  }

  // Determine project directory
  const projectDir = resolve(process.cwd());
  const settingsPath = join(projectDir, ".claude", "settings.json");

  console.log("Uninstalling opencode-prompts hooks...\n");

  // Check if settings file exists
  if (!existsSync(settingsPath)) {
    console.log("\u2713 No .claude/settings.json found, nothing to uninstall");
    return;
  }

  // Show current state
  const settings = readClaudeSettings(projectDir);
  if (settings?.hooks) {
    const hookEvents = Object.keys(settings.hooks);
    console.log(`Found ${hookEvents.length} hook event type(s) in settings`);
  }

  // Uninstall hooks
  const result = uninstallHooks(projectDir);

  if (result.success) {
    console.log(`\n\u2713 ${result.message}`);

    if (result.backupPath) {
      console.log(`\nBackup created at: ${result.backupPath}`);
    }

    if (result.removed && result.removed > 0) {
      console.log("\nRemoved hooks:");
      console.log("  - UserPromptSubmit: prompt-suggest.py");
      console.log("  - PostToolUse: post-prompt-engine.py");
      console.log("  - PreCompact: pre-compact.py");
      console.log("\nYour other hooks (if any) have been preserved.");
    }

    // Verify removal
    const afterSettings = readClaudeSettings(projectDir);
    if (afterSettings?.hooks && Object.keys(afterSettings.hooks).length > 0) {
      const remaining = Object.keys(afterSettings.hooks);
      console.log(`\nRemaining hook events: ${remaining.join(", ")}`);
    } else {
      console.log("\nNo hooks remaining in .claude/settings.json");
    }

    console.log("\nTo fully remove opencode-prompts:");
    console.log("  npm uninstall opencode-prompts");
    console.log("  # Or if git-cloned:");
    console.log("  rm -rf .opencode/plugin/opencode-prompts");
  } else {
    console.error(`\u2717 ${result.message}`);
    process.exit(1);
  }
}

function showUninstallHelp(): void {
  console.log(`
opencode-prompts uninstall - Remove Claude hooks

Usage: opencode-prompts uninstall [options]

Options:
  --help, -h    Show this help message

Description:
  Removes opencode-prompts hooks from .claude/settings.json.

  Safety features:
  - Creates backup at .claude/settings.json.backup before modification
  - Only removes hooks matching opencode-prompts patterns
  - Preserves all other hooks in the file
  - Cleans up empty hook event arrays

  Hooks removed:
  - UserPromptSubmit: prompt-suggest.py
  - PostToolUse: post-prompt-engine.py
  - PreCompact: pre-compact.py

Examples:
  opencode-prompts uninstall
  npx opencode-prompts uninstall
`);
}
