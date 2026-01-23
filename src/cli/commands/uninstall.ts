/**
 * Uninstall command for opencode-prompts CLI.
 *
 * Detects and removes:
 * 1. Global hooks from ~/.claude/hooks/
 * 2. Project hooks from ./.claude/hooks/
 * 3. Plugin registration (global and project)
 * 4. MCP configuration
 */

import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  uninstallHooks,
  uninstallGlobalHooks,
  uninstallProjectHooks,
  getGlobalPaths,
  getProjectPaths,
  hasGlobalHooks,
  hasProjectHooks,
  readClaudeSettings,
} from "../../lib/hooks-config.js";
import {
  removePluginRegistration,
  removePluginRegistrationFromProject,
  removeMcpConfigFromGlobal,
  removeMcpConfigFromProject,
  hasPluginRegistration,
  hasMcpConfig,
  readGlobalConfig,
  readOpencodeConfig,
} from "../../lib/opencode-config.js";

/**
 * Uninstall hooks from the system.
 */
export async function uninstall(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    showUninstallHelp();
    return;
  }

  const projectDir = resolve(process.cwd());

  console.log("\n┌─────────────────────────────────────────────────┐");
  console.log("│  opencode-prompts Uninstall                     │");
  console.log("└─────────────────────────────────────────────────┘\n");

  // Detect what's installed
  const globalPaths = getGlobalPaths();
  const projectPaths = getProjectPaths(projectDir);

  const hasGlobal = hasGlobalHooks();
  const hasProject = hasProjectHooks(projectDir);
  const globalConfig = readGlobalConfig();
  const projectConfig = readOpencodeConfig(projectDir);
  const hasGlobalPlugin = hasPluginRegistration(globalConfig);
  const hasProjectPlugin = hasPluginRegistration(projectConfig);
  const hasGlobalMcp = hasMcpConfig(globalConfig);
  const hasProjectMcp = hasMcpConfig(projectConfig);
  const legacySettingsPath = join(projectDir, ".claude", "settings.json");
  const hasLegacy = existsSync(legacySettingsPath);

  // Show what was found
  console.log("Detected installations:");
  if (hasGlobal) console.log(`  • Global hooks: ${globalPaths.ourHooksDir}`);
  if (hasProject) console.log(`  • Project hooks: ${projectPaths.ourHooksDir}`);
  if (hasGlobalPlugin) console.log("  • Global plugin registration");
  if (hasProjectPlugin) console.log("  • Project plugin registration");
  if (hasGlobalMcp) console.log("  • Global MCP configuration");
  if (hasProjectMcp) console.log("  • Project MCP configuration");
  if (hasLegacy) console.log("  • Legacy hooks in .claude/settings.json");

  if (!hasGlobal && !hasProject && !hasGlobalPlugin && !hasProjectPlugin && !hasGlobalMcp && !hasProjectMcp && !hasLegacy) {
    console.log("  (nothing found)\n");
    console.log("No opencode-prompts installation detected.\n");
    return;
  }

  console.log();

  let hasErrors = false;

  // Remove global hooks
  if (hasGlobal) {
    console.log("Removing global hooks...");
    const result = uninstallGlobalHooks();
    if (result.success) {
      console.log(`✓ Removed hooks from ${globalPaths.ourHooksDir}`);
    } else {
      console.log(`✗ ${result.message}`);
      hasErrors = true;
    }
    console.log();
  }

  // Remove project hooks
  if (hasProject) {
    console.log("Removing project hooks...");
    const result = uninstallProjectHooks(projectDir);
    if (result.success) {
      console.log(`✓ Removed hooks from ${projectPaths.ourHooksDir}`);
    } else {
      console.log(`✗ ${result.message}`);
      hasErrors = true;
    }
    console.log();
  }

  // Remove global plugin registration
  if (hasGlobalPlugin) {
    console.log("Removing global plugin registration...");
    const result = removePluginRegistration();
    if (result.success) {
      console.log("✓ Removed from ~/.config/opencode/opencode.json");
    } else {
      console.log(`✗ ${result.message}`);
      hasErrors = true;
    }
    console.log();
  }

  // Remove project plugin registration
  if (hasProjectPlugin) {
    console.log("Removing project plugin registration...");
    const result = removePluginRegistrationFromProject(projectDir);
    if (result.success) {
      console.log("✓ Removed from ./opencode.json");
    } else {
      console.log(`✗ ${result.message}`);
      hasErrors = true;
    }
    console.log();
  }

  // Remove global MCP configuration
  if (hasGlobalMcp) {
    console.log("Removing global MCP configuration...");
    const result = removeMcpConfigFromGlobal();
    if (result.success) {
      console.log("✓ Removed MCP configuration from ~/.config/opencode/opencode.json");
    } else {
      console.log(`✗ ${result.message}`);
      hasErrors = true;
    }
    console.log();
  }

  // Remove project MCP configuration
  if (hasProjectMcp) {
    console.log("Removing project MCP configuration...");
    const result = removeMcpConfigFromProject(projectDir);
    if (result.success) {
      console.log("✓ Removed MCP configuration from ./opencode.json");
    } else {
      console.log(`✗ ${result.message}`);
      hasErrors = true;
    }
    console.log();
  }

  // Remove legacy hooks
  if (hasLegacy) {
    console.log("Cleaning up legacy hooks...");
    const legacySettings = readClaudeSettings(projectDir);
    if (legacySettings?.hooks) {
      const result = uninstallHooks(projectDir);
      if (result.success) {
        if (result.removed && result.removed > 0) {
          console.log(`✓ Removed ${result.removed} legacy hook(s) from .claude/settings.json`);
        } else {
          console.log("✓ No legacy hooks found");
        }
      } else {
        console.log(`  Note: ${result.message}`);
      }
    } else {
      console.log("✓ No hooks in .claude/settings.json");
    }
    console.log();
  }

  // Summary
  if (hasErrors) {
    console.log("Uninstallation completed with errors.\n");
    process.exit(1);
  }

  console.log("✓ Uninstallation complete!\n");

  console.log("To fully remove the package:");
  console.log("  npm uninstall opencode-prompts\n");
}

function showUninstallHelp(): void {
  const { ourHooksDir, hooksJsonPath } = getGlobalPaths();

  console.log(`
opencode-prompts uninstall - Remove hooks and configuration

Usage: opencode-prompts uninstall [options]

Options:
  --help, -h      Show this help message

Description:
  Detects and removes all opencode-prompts installations:

  1. Global Hooks (if found):
     - Removes entries from ${hooksJsonPath}
     - Deletes scripts from ${ourHooksDir}

  2. Project Hooks (if found):
     - Removes from ./.claude/hooks/

  3. Plugin Registration:
     - Removes from global ~/.config/opencode/opencode.json
     - Removes from project ./opencode.json

  4. MCP Configuration:
     - Removes from project ./opencode.json

  5. Legacy Cleanup:
     - Removes hooks from .claude/settings.json (old format)

Examples:
  opencode-prompts uninstall     # Remove all detected installations
  npx opencode-prompts uninstall # Via npx
`);
}
