#!/usr/bin/env node
/**
 * OpenCode Prompts CLI
 *
 * Provides install/uninstall commands for managing Claude hooks
 * that enable oh-my-opencode integration.
 *
 * Usage:
 *   npx opencode-prompts install   - Set up hooks in .claude/settings.json
 *   npx opencode-prompts uninstall - Remove hooks from .claude/settings.json
 */

import { install } from "./commands/install.js";
import { uninstall } from "./commands/uninstall.js";

const command = process.argv[2];
const args = process.argv.slice(3);

function showUsage(): void {
  console.log(`
opencode-prompts - CLI for managing Claude hooks

Usage: opencode-prompts <command> [options]

Commands:
  install    Set up hooks in .claude/settings.json
  uninstall  Remove hooks from .claude/settings.json

Options:
  --help, -h    Show this help message
  --version     Show version number

Examples:
  npx opencode-prompts install
  npx opencode-prompts uninstall

For more information, visit:
  https://github.com/minipuft/opencode-prompts
`);
}

function showVersion(): void {
  // Import version from package.json at runtime
  import("../../package.json", { with: { type: "json" } })
    .then((pkg) => {
      console.log(pkg.default.version);
    })
    .catch(() => {
      console.log("unknown");
    });
}

async function main(): Promise<void> {
  // Handle help flags
  if (!command || command === "--help" || command === "-h") {
    showUsage();
    process.exit(command ? 0 : 1);
  }

  // Handle version flag
  if (command === "--version") {
    showVersion();
    return;
  }

  // Route commands
  switch (command) {
    case "install":
      await install(args);
      break;

    case "uninstall":
      await uninstall(args);
      break;

    default:
      console.error(`Unknown command: ${command}`);
      showUsage();
      process.exit(1);
  }
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
