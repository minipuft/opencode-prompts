/**
 * Install command for opencode-prompts CLI.
 *
 * Sets up:
 * 1. Global Claude hooks in ~/.claude/hooks/ for oh-my-opencode integration
 * 2. MCP configuration in opencode.json (optional, for project-level setup)
 *
 * Hooks are copied to ~/.claude/hooks/claude-prompts/ and registered
 * in ~/.claude/hooks/hooks.json for reliable global access.
 */

import { resolve } from "node:path";
import {
  installGlobalHooks,
  getGlobalPaths,
  hasGlobalHooks,
  findHooksSource,
} from "../../lib/hooks-config.js";
import { installMcpConfig } from "../../lib/opencode-config.js";
import { detectExistingInstallation } from "../../lib/detect-installation.js";

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
  const skipMcp = args.includes("--skip-mcp");
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

  // Step 2: Install global hooks (unless skipped)
  if (!skipHooks) {
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

  // Step 3: Install MCP configuration (unless skipped)
  if (!skipMcp) {
    console.log("Setting up MCP configuration...");
    const mcpResult = installMcpConfig(projectDir);

    if (mcpResult.success) {
      if (mcpResult.skipped) {
        console.log("✓ MCP configuration already exists (skipped)");
      } else if (mcpResult.created) {
        console.log("✓ Created opencode.json with claude-prompts MCP");
      } else if (mcpResult.modified) {
        console.log("✓ Added claude-prompts MCP to opencode.json");
      }
    } else {
      console.error(`✗ MCP setup failed: ${mcpResult.message}`);
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

  console.log("✓ Installation complete!\n");

  console.log("What was configured:");
  const { ourHooksDir, hooksJsonPath } = getGlobalPaths();
  if (!skipHooks) {
    console.log(`  • Hooks copied to: ${ourHooksDir}`);
    console.log(`  • Hooks registered in: ${hooksJsonPath}`);
  }
  if (!skipMcp) {
    console.log("  • MCP server: opencode.json (project-level)");
  }

  console.log("\nTo verify installation:");
  console.log("  1. Start OpenCode in your project");
  console.log("  2. Try: >>diagnose to test the setup");
  console.log("  3. Check hooks: cat ~/.claude/hooks/hooks.json");
}

function showInstallHelp(): void {
  const { ourHooksDir, hooksJsonPath } = getGlobalPaths();

  console.log(`
opencode-prompts install - Set up hooks and MCP

Usage: opencode-prompts install [options]

Options:
  --help, -h      Show this help message
  --skip-mcp      Skip MCP configuration (only set up hooks)
  --skip-hooks    Skip hooks configuration (only set up MCP)
  --force         Reinstall hooks even if already installed

Description:
  Sets up opencode-prompts for oh-my-opencode:

  1. Global Hooks (${ourHooksDir}):
     - Copies hook scripts from node_modules/claude-prompts/hooks
     - Registers in ${hooksJsonPath}
     - UserPromptSubmit: Detects >>prompt syntax
     - PostToolUse: Tracks chain progress and gate reminders
     - PreCompact: Preserves workflow state across compaction

  2. MCP Configuration (optional, project-level):
     - Registers claude-prompts MCP server in opencode.json
     - Enables prompt_engine, resource_manager, system_control tools

  Existing configurations are preserved and merged.

Examples:
  opencode-prompts install             # Full setup
  npx opencode-prompts install         # Via npx
  opencode-prompts install --skip-mcp  # Hooks only
  opencode-prompts install --force     # Reinstall hooks
`);
}
