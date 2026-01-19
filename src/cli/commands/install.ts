/**
 * Install command for opencode-prompts CLI.
 *
 * Sets up:
 * 1. MCP configuration in opencode.json for claude-prompts server
 * 2. Claude hooks in .claude/settings.json for oh-my-opencode integration
 */

import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { installHooks, getHooksDir } from "../../lib/hooks-config.js";
import { installMcpConfig } from "../../lib/opencode-config.js";

/**
 * Install opencode-prompts into the current project.
 */
export async function install(args: string[]): Promise<void> {
  // Check for help flag
  if (args.includes("--help") || args.includes("-h")) {
    showInstallHelp();
    return;
  }

  // Parse flags
  const skipMcp = args.includes("--skip-mcp");
  const skipHooks = args.includes("--skip-hooks");

  // Determine project directory
  const projectDir = resolve(process.cwd());

  console.log("Installing opencode-prompts...\n");

  let hasErrors = false;

  // Step 1: Install MCP configuration (unless skipped)
  if (!skipMcp) {
    console.log("Setting up MCP configuration...");
    const mcpResult = installMcpConfig(projectDir);

    if (mcpResult.success) {
      if (mcpResult.skipped) {
        console.log("\u2713 MCP configuration already exists (skipped)");
      } else if (mcpResult.created) {
        console.log("\u2713 Created opencode.json with claude-prompts MCP");
      } else if (mcpResult.modified) {
        console.log("\u2713 Added claude-prompts MCP to opencode.json");
      }
    } else {
      console.error(`\u2717 MCP setup failed: ${mcpResult.message}`);
      hasErrors = true;
    }
    console.log();
  }

  // Step 2: Install hooks (unless skipped)
  if (!skipHooks) {
    console.log("Setting up oh-my-opencode hooks...");

    // Verify hooks directory exists
    const hooksDir = getHooksDir(projectDir);
    const fullHooksDir = join(projectDir, hooksDir);

    if (!existsSync(fullHooksDir)) {
      console.log(`  Note: Hooks directory not found at ${hooksDir}`);
      console.log("  Hooks will work once claude-prompts is installed.\n");
    }

    const hooksResult = installHooks(projectDir);

    if (hooksResult.success) {
      if (hooksResult.created) {
        console.log("\u2713 Created .claude/settings.json with hooks");
      } else if (hooksResult.merged) {
        console.log("\u2713 Merged hooks into existing .claude/settings.json");
      } else {
        console.log("\u2713 Hooks already installed (skipped)");
      }
    } else {
      console.error(`\u2717 Hooks setup failed: ${hooksResult.message}`);
      hasErrors = true;
    }
    console.log();
  }

  // Summary
  if (hasErrors) {
    console.log("Installation completed with errors.");
    console.log("Some features may not work correctly.");
    process.exit(1);
  }

  console.log("\u2713 Installation complete!\n");

  console.log("What was configured:");
  if (!skipMcp) {
    console.log("  - opencode.json: claude-prompts MCP server");
  }
  if (!skipHooks) {
    console.log("  - .claude/settings.json: oh-my-opencode hooks");
  }

  console.log("\nNext steps:");
  console.log("  1. Add to opencode.json: \"plugin\": [\"opencode-prompts\"]");
  console.log("  2. Start OpenCode in your project");
  console.log("  3. Try: >>diagnose to test the setup");
}

function showInstallHelp(): void {
  console.log(`
opencode-prompts install - Set up MCP and hooks

Usage: opencode-prompts install [options]

Options:
  --help, -h      Show this help message
  --skip-mcp      Skip MCP configuration (only set up hooks)
  --skip-hooks    Skip hooks configuration (only set up MCP)

Description:
  Sets up opencode-prompts in your project:

  1. MCP Configuration (opencode.json):
     - Registers claude-prompts MCP server from node_modules
     - Enables prompt_engine, resource_manager, system_control tools

  2. Hooks Configuration (.claude/settings.json):
     - UserPromptSubmit: Detects >>prompt syntax
     - PostToolUse: Tracks chain progress and gate reminders
     - PreCompact: Preserves workflow state across compaction

  Existing configurations are preserved and merged.

Examples:
  opencode-prompts install           # Full setup
  npx opencode-prompts install       # Via npx
  opencode-prompts install --skip-mcp  # Hooks only
`);
}
