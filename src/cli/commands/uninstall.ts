/**
 * Uninstall command for opencode-prompts CLI.
 *
 * Removes:
 * 1. Global hooks from ~/.claude/hooks/hooks.json
 * 2. Hook scripts from ~/.claude/hooks/claude-prompts/
 * 3. Plugin registration from ~/.config/opencode/opencode.json(c)
 * 4. Legacy hooks from project .claude/settings.json (cleanup)
 */

import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  uninstallHooks,
  uninstallGlobalHooks,
  getGlobalPaths,
  hasGlobalHooks,
  readClaudeSettings,
} from "../../lib/hooks-config.js";
import {
  removePluginRegistration,
  hasPluginRegistration,
  readGlobalConfig,
} from "../../lib/opencode-config.js";
import { detectExistingInstallation } from "../../lib/detect-installation.js";

/**
 * Uninstall hooks from the system.
 */
export async function uninstall(args: string[]): Promise<void> {
  // Check for help flag
  if (args.includes("--help") || args.includes("-h")) {
    showUninstallHelp();
    return;
  }

  // Parse flags
  const cleanupLegacy = args.includes("--cleanup-legacy");

  // Determine project directory (for legacy cleanup)
  const projectDir = resolve(process.cwd());

  console.log("Uninstalling opencode-prompts...\n");

  // Step 1: Show current installation status
  console.log("Checking installation status...");
  const status = detectExistingInstallation();

  if (status.details.length > 0) {
    for (const detail of status.details) {
      console.log(`  • ${detail}`);
    }
    console.log();
  } else {
    console.log("  No installation detected.\n");
  }

  let hasErrors = false;

  // Step 2: Uninstall global hooks
  console.log("Removing global hooks...");

  if (!hasGlobalHooks() && !status.hooksDirExists) {
    console.log("✓ No global hooks found, nothing to remove.\n");
  } else {
    const result = uninstallGlobalHooks();

    if (result.success) {
      const { ourHooksDir, hooksJsonPath } = getGlobalPaths();
      console.log(`✓ Removed hooks from ${hooksJsonPath}`);
      console.log(`✓ Removed hook scripts from ${ourHooksDir}`);
    } else {
      console.error(`✗ ${result.message}`);
      hasErrors = true;
    }
    console.log();
  }

  // Step 3: Remove plugin registration from global config
  console.log("Removing plugin registration...");
  const globalConfig = readGlobalConfig();

  if (!hasPluginRegistration(globalConfig)) {
    console.log("✓ No plugin registration found in global config.\n");
  } else {
    const pluginResult = removePluginRegistration();

    if (pluginResult.success) {
      if (pluginResult.modified) {
        console.log(`✓ Removed opencode-prompts from plugin array in ${pluginResult.configPath}`);
      } else {
        console.log(`✓ ${pluginResult.message}`);
      }
    } else {
      console.error(`✗ ${pluginResult.message}`);
      hasErrors = true;
    }
    console.log();
  }

  // Step 4: Clean up legacy project-level hooks (if requested or found)
  const legacySettingsPath = join(projectDir, ".claude", "settings.json");
  const hasLegacyHooks = existsSync(legacySettingsPath);

  if (hasLegacyHooks && (cleanupLegacy || args.length === 0)) {
    console.log("Cleaning up legacy project hooks...");

    const legacySettings = readClaudeSettings(projectDir);
    if (legacySettings?.hooks) {
      const legacyResult = uninstallHooks(projectDir);

      if (legacyResult.success) {
        if (legacyResult.removed && legacyResult.removed > 0) {
          console.log(`✓ Removed ${legacyResult.removed} legacy hook(s) from .claude/settings.json`);
          if (legacyResult.backupPath) {
            console.log(`  Backup: ${legacyResult.backupPath}`);
          }
        } else {
          console.log("✓ No legacy hooks found in .claude/settings.json");
        }
      } else {
        console.log(`  Note: ${legacyResult.message}`);
      }
    } else {
      console.log("✓ No hooks in project .claude/settings.json");
    }
    console.log();
  }

  // Summary
  if (hasErrors) {
    console.log("Uninstallation completed with errors.");
    process.exit(1);
  }

  console.log("✓ Uninstallation complete!\n");

  console.log("What was removed:");
  const { ourHooksDir, hooksJsonPath } = getGlobalPaths();
  console.log(`  • Hook scripts from: ${ourHooksDir}`);
  console.log(`  • Hook registration from: ${hooksJsonPath}`);
  console.log("  • Plugin registration from: ~/.config/opencode/opencode.json(c)");
  if (hasLegacyHooks) {
    console.log("  • Legacy hooks from: .claude/settings.json");
  }

  console.log("\nTo fully remove the package:");
  console.log("  npm uninstall opencode-prompts");
}

function showUninstallHelp(): void {
  const { ourHooksDir, hooksJsonPath } = getGlobalPaths();

  console.log(`
opencode-prompts uninstall - Remove hooks and plugin registration

Usage: opencode-prompts uninstall [options]

Options:
  --help, -h        Show this help message
  --cleanup-legacy  Also clean up legacy project .claude/settings.json hooks

Description:
  Removes opencode-prompts from your system:

  1. Global Hooks:
     - Removes entries from ${hooksJsonPath}
     - Deletes hook scripts from ${ourHooksDir}

  2. Plugin Registration:
     - Removes "opencode-prompts" from plugin array
     - Config: ~/.config/opencode/opencode.json(c)

  3. Legacy Cleanup (with --cleanup-legacy):
     - Removes hooks from project .claude/settings.json
     - Creates backup before modification
     - Preserves other hooks

  Hooks removed:
  - UserPromptSubmit: prompt-suggest.py
  - PostToolUse: post-prompt-engine.py
  - PreCompact: pre-compact.py

Examples:
  opencode-prompts uninstall                   # Full uninstall
  npx opencode-prompts uninstall               # Via npx
  opencode-prompts uninstall --cleanup-legacy  # Also clean legacy project hooks
`);
}
