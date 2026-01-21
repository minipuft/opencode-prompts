/**
 * Install command for opencode-prompts CLI.
 *
 * Sets up:
 * 1. Global Claude hooks in ~/.claude/hooks/ for oh-my-opencode integration
 * 2. Plugin registration in global ~/.config/opencode/opencode.json(c)
 *
 * Hooks are copied to ~/.claude/hooks/claude-prompts/ and registered
 * in ~/.claude/hooks/hooks.json for reliable global access.
 */

import { resolve } from "node:path";
import * as readline from "node:readline/promises";
import {
  installGlobalHooks,
  getGlobalPaths,
  hasGlobalHooks,
  findHooksSource,
} from "../../lib/hooks-config.js";
import {
  installPluginRegistration,
  hasPluginRegistration,
  readGlobalConfig,
} from "../../lib/opencode-config.js";
import { detectExistingInstallation } from "../../lib/detect-installation.js";

/**
 * Ask a yes/no question via stdin.
 */
async function askYesNo(question: string, defaultYes = true): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const prompt = defaultYes ? "[Y/n]" : "[y/N]";
    const answer = await rl.question(`${question} ${prompt}: `);
    const normalized = answer.toLowerCase().trim();

    if (normalized === "") {
      return defaultYes;
    }
    return normalized === "y" || normalized === "yes";
  } finally {
    rl.close();
  }
}

/**
 * Install opencode-prompts into the system.
 */
export async function install(args: string[]): Promise<void> {
  // Check for help flag
  if (args.includes("--help") || args.includes("-h")) {
    showInstallHelp();
    return;
  }

  // Parse flags
  const autoYes = args.includes("--yes") || args.includes("-y");
  const skipHooks = args.includes("--skip-hooks");
  const forceHooks = args.includes("--force");

  // Determine project directory
  const projectDir = resolve(process.cwd());

  console.log("Installing opencode-prompts...\n");

  // Step 1: Detect existing installation
  console.log("Checking existing installation...");
  const status = detectExistingInstallation();

  if (status.details.length > 0) {
    for (const detail of status.details) {
      console.log(`  • ${detail}`);
    }
    console.log();
  } else {
    console.log("  No existing installation detected.\n");
  }

  let hasErrors = false;
  let shouldInstallHooks = !skipHooks;

  // Step 2: Check for claude-prompts plugin and ask about hooks
  if (shouldInstallHooks && status.pluginInstalled && !autoYes) {
    console.log("⚠️  Claude-prompts plugin detected in ~/.claude/plugins/");
    console.log("   The plugin already provides prompt functionality.\n");

    shouldInstallHooks = await askYesNo("Install hooks anyway? (for additional features)", true);
    if (!shouldInstallHooks) {
      console.log("  Skipping hooks installation.\n");
    }
  }

  // Step 3: Install global hooks (unless skipped)
  if (shouldInstallHooks) {
    console.log("Setting up global hooks...");

    // Check if already installed (and not forcing)
    if (hasGlobalHooks() && !forceHooks) {
      console.log("✓ Hooks already registered in ~/.claude/hooks/hooks.json");
      console.log("  Use --force to reinstall hooks.\n");
    } else {
      // Verify we can find hooks source
      const hooksSource = findHooksSource(projectDir);
      if (!hooksSource) {
        console.log("✗ Could not find hooks in node_modules/claude-prompts/hooks");
        console.log("  Ensure 'claude-prompts' package is installed.\n");
        hasErrors = true;
      } else {
        const hooksResult = installGlobalHooks(projectDir);

        if (hooksResult.success) {
          const { ourHooksDir, hooksJsonPath } = getGlobalPaths();
          console.log(`✓ Copied hooks to ${ourHooksDir}`);
          console.log(`✓ Registered hooks in ${hooksJsonPath}`);
        } else {
          console.error(`✗ Hooks setup failed: ${hooksResult.message}`);
          hasErrors = true;
        }
      }
    }
    console.log();
  }

  // Step 4: Install global plugin registration
  console.log("Setting up plugin registration...");
  const globalConfig = readGlobalConfig();

  if (hasPluginRegistration(globalConfig)) {
    console.log("✓ Plugin already registered in global config (skipped)");
  } else {
    const pluginResult = installPluginRegistration();

    if (pluginResult.success) {
      if (pluginResult.created) {
        console.log(`✓ Created ${pluginResult.configPath} with plugin registration`);
      } else if (pluginResult.modified) {
        console.log(`✓ Added opencode-prompts to plugin array in ${pluginResult.configPath}`);
      }
    } else {
      console.error(`✗ Plugin registration failed: ${pluginResult.message}`);
      hasErrors = true;
    }
  }
  console.log();

  // Summary
  if (hasErrors) {
    console.log("Installation completed with errors.");
    console.log("Some features may not work correctly.");
    process.exit(1);
  }

  console.log("✓ Installation complete!\n");

  console.log("What was configured:");
  const { ourHooksDir, hooksJsonPath } = getGlobalPaths();
  if (shouldInstallHooks) {
    console.log(`  • Hooks copied to: ${ourHooksDir}`);
    console.log(`  • Hooks registered in: ${hooksJsonPath}`);
  }
  console.log("  • Plugin registered in: ~/.config/opencode/opencode.json(c)");

  console.log("\nTo verify installation:");
  console.log("  1. Start OpenCode in your project");
  console.log("  2. Try: >>diagnose to test the setup");
  console.log("  3. Check hooks: cat ~/.claude/hooks/hooks.json");
  console.log("  4. Check plugin: cat ~/.config/opencode/opencode.json | jq .plugin");
}

function showInstallHelp(): void {
  const { ourHooksDir, hooksJsonPath } = getGlobalPaths();

  console.log(`
opencode-prompts install - Set up hooks and plugin registration

Usage: opencode-prompts install [options]

Options:
  --help, -h      Show this help message
  --yes, -y       Skip prompts (auto-yes to all questions)
  --skip-hooks    Skip hooks configuration (only register plugin)
  --force         Reinstall hooks even if already installed

Description:
  Sets up opencode-prompts for oh-my-opencode:

  1. Global Hooks (${ourHooksDir}):
     - Copies hook scripts from node_modules/claude-prompts/hooks
     - Registers in ${hooksJsonPath}
     - UserPromptSubmit: Detects >>prompt syntax
     - PostToolUse: Tracks chain progress and gate reminders
     - PreCompact: Preserves workflow state across compaction

  2. Plugin Registration (~/.config/opencode/opencode.json):
     - Adds "opencode-prompts" to the global plugin array
     - Enables the plugin for all OpenCode projects

  Existing configurations are preserved and merged.

Examples:
  opencode-prompts install              # Full setup with prompts
  npx opencode-prompts install -y       # Full setup, skip prompts
  opencode-prompts install --skip-hooks # Plugin registration only
  opencode-prompts install --force      # Reinstall hooks
`);
}
