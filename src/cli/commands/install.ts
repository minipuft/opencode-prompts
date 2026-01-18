/**
 * Install command for opencode-prompts CLI.
 *
 * Sets up Claude hooks in .claude/settings.json for oh-my-opencode integration.
 * This enables UserPromptSubmit hook for >>prompt syntax detection.
 */

import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { installHooks, getHooksDir } from "../../lib/hooks-config.js";

/**
 * Install hooks into the current project.
 */
export async function install(args: string[]): Promise<void> {
  // Check for help flag
  if (args.includes("--help") || args.includes("-h")) {
    showInstallHelp();
    return;
  }

  // Determine project directory
  const projectDir = resolve(process.cwd());

  console.log("Installing opencode-prompts hooks...\n");

  // Verify hooks directory exists
  const hooksDir = getHooksDir(projectDir);
  const fullHooksDir = join(projectDir, hooksDir);

  if (!existsSync(fullHooksDir)) {
    console.log(`Note: Hooks directory not found at ${hooksDir}`);
    console.log("Hooks will be configured to look for the directory once the package is installed.\n");
  }

  // Install hooks
  const result = installHooks(projectDir);

  if (result.success) {
    console.log(`\u2713 ${result.message}`);

    if (result.created) {
      console.log("\nCreated .claude/settings.json with the following hooks:");
      console.log("  - UserPromptSubmit: >>prompt syntax detection");
      console.log("  - PostToolUse: Chain/gate tracking");
      console.log("  - PreCompact: State preservation");
    } else if (result.merged) {
      console.log("\nMerged hooks into existing .claude/settings.json");
      console.log("Your existing hooks have been preserved.");
    }

    console.log("\nNext steps:");
    console.log("  1. Install oh-my-opencode: npx oh-my-opencode install");
    console.log("  2. Restart your OpenCode session");
    console.log("  3. Try: >>diagnose to test syntax detection");
  } else {
    console.error(`\u2717 ${result.message}`);
    process.exit(1);
  }
}

function showInstallHelp(): void {
  console.log(`
opencode-prompts install - Set up Claude hooks

Usage: opencode-prompts install [options]

Options:
  --help, -h    Show this help message

Description:
  Creates or updates .claude/settings.json with hooks for oh-my-opencode:

  - UserPromptSubmit: Detects >>prompt syntax and suggests MCP calls
  - PostToolUse: Tracks chain progress and gate reminders
  - PreCompact: Preserves workflow state across session compaction

  If .claude/settings.json already exists, hooks are merged while
  preserving your existing configuration.

Examples:
  opencode-prompts install
  npx opencode-prompts install
`);
}
