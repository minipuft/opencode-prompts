/**
 * Install command for opencode-prompts CLI.
 *
 * Provides an interactive wizard to set up:
 * 1. Claude Code hooks (global or project)
 * 2. Plugin registration (global or project)
 * 3. MCP server configuration with custom workspace
 */

import { resolve } from "node:path";
import {
  runWizardStep,
  confirmWizard,
  type WizardStep,
} from "../wizard.js";
import {
  installGlobalHooks,
  installProjectHooks,
  getGlobalPaths,
  getProjectPaths,
  findHooksSource,
} from "../../lib/hooks-config.js";
import {
  installPluginRegistration,
  installPluginRegistrationToProject,
  installMcpConfigToGlobal,
  installMcpConfigToProject,
} from "../../lib/opencode-config.js";
import { detectExistingInstallation } from "../../lib/detect-installation.js";

/**
 * Install configuration choices.
 */
interface InstallConfig {
  hooks: "global" | "project" | "skip";
  plugin: "global" | "project" | "skip";
  mcp: "global-hooks" | "custom" | "skip";
  mcpPath?: string;
}

/**
 * Default configuration values.
 */
const DEFAULTS: InstallConfig = {
  hooks: "global",
  plugin: "global",
  mcp: "global-hooks",
};

/**
 * Install opencode-prompts into the system.
 */
export async function install(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    showInstallHelp();
    return;
  }

  const projectDir = resolve(process.cwd());

  console.log("\n┌─────────────────────────────────────────────────┐");
  console.log("│  opencode-prompts Install Wizard                │");
  console.log("└─────────────────────────────────────────────────┘\n");

  // Show current state
  const status = detectExistingInstallation();
  if (status.details.length > 0) {
    console.log("Current installation:");
    for (const detail of status.details) {
      console.log(`  • ${detail}`);
    }
    console.log();
  }

  // Non-interactive mode
  if (args.includes("--yes") || args.includes("-y")) {
    console.log("Running with defaults (non-interactive mode)...\n");
    await executeInstall(projectDir, DEFAULTS);
    return;
  }

  // Interactive wizard
  let config: InstallConfig | null = null;

  while (!config) {
    const wizardConfig = await runInstallWizard(projectDir);
    const summary = buildSummary(projectDir, wizardConfig);

    const action = await confirmWizard(summary);

    if (action === "quit") {
      console.log("\nInstallation cancelled.\n");
      return;
    }

    if (action === "confirm") {
      config = wizardConfig;
    }
    // action === "change" loops back
  }

  await executeInstall(projectDir, config);
}

/**
 * Run the interactive wizard.
 */
async function runInstallWizard(projectDir: string): Promise<InstallConfig> {
  const globalPaths = getGlobalPaths();
  const projectPaths = getProjectPaths(projectDir);

  // Step 1: Hooks
  const hooksStep: WizardStep = {
    id: "hooks",
    title: "HOOKS",
    description: "Install Claude Code hooks for chain tracking and gate reminders?",
    choices: [
      {
        key: "1",
        label: `Global (${globalPaths.ourHooksDir})`,
        value: "global",
        recommended: true,
      },
      {
        key: "2",
        label: `Project (${projectPaths.ourHooksDir})`,
        value: "project",
      },
      {
        key: "3",
        label: "Skip hooks",
        value: "skip",
      },
    ],
  };

  const hooksChoice = await runWizardStep(hooksStep, 1, 3);

  // Step 2: Plugin Registration
  const pluginStep: WizardStep = {
    id: "plugin",
    title: "PLUGIN REGISTRATION",
    description: "Register opencode-prompts in OpenCode config?",
    choices: [
      {
        key: "1",
        label: "Global (~/.config/opencode/opencode.json)",
        value: "global",
        recommended: true,
      },
      {
        key: "2",
        label: "Project (./opencode.json)",
        value: "project",
      },
      {
        key: "3",
        label: "Skip registration",
        value: "skip",
      },
    ],
  };

  const pluginChoice = await runWizardStep(pluginStep, 2, 3);

  // Step 3: MCP Configuration
  const hooksDir = hooksChoice === "global"
    ? globalPaths.ourHooksDir
    : hooksChoice === "project"
      ? projectPaths.ourHooksDir
      : globalPaths.ourHooksDir;

  const mcpStep: WizardStep = {
    id: "mcp",
    title: "MCP SERVER",
    description: "Configure MCP server for prompt_engine tools?",
    choices: [
      {
        key: "1",
        label: `Set MCP_WORKSPACE to hooks dir (${hooksDir})`,
        value: "global-hooks",
        recommended: true,
      },
      {
        key: "2",
        label: "Skip MCP config",
        value: "skip",
      },
    ],
    allowCustom: true,
    customPrompt: "Enter custom MCP_WORKSPACE path",
  };

  const mcpChoice = await runWizardStep(mcpStep, 3, 3);

  // Parse custom path if provided
  let mcpValue: InstallConfig["mcp"] = "skip";
  let mcpPath: string | undefined;

  if (mcpChoice.startsWith("custom:")) {
    mcpValue = "custom";
    mcpPath = mcpChoice.slice(7);
  } else {
    mcpValue = mcpChoice as InstallConfig["mcp"];
  }

  return {
    hooks: hooksChoice as InstallConfig["hooks"],
    plugin: pluginChoice as InstallConfig["plugin"],
    mcp: mcpValue,
    mcpPath,
  };
}

/**
 * Build summary for confirmation.
 */
function buildSummary(
  projectDir: string,
  config: InstallConfig
): { label: string; value: string }[] {
  const summary: { label: string; value: string }[] = [];
  const globalPaths = getGlobalPaths();
  const projectPaths = getProjectPaths(projectDir);

  // Hooks
  if (config.hooks === "global") {
    summary.push({ label: "Hooks", value: globalPaths.ourHooksDir });
  } else if (config.hooks === "project") {
    summary.push({ label: "Hooks", value: projectPaths.ourHooksDir });
  } else {
    summary.push({ label: "Hooks", value: "(skipped)" });
  }

  // Plugin
  if (config.plugin === "global") {
    summary.push({ label: "Plugin", value: "~/.config/opencode/opencode.json" });
  } else if (config.plugin === "project") {
    summary.push({ label: "Plugin", value: "./opencode.json" });
  } else {
    summary.push({ label: "Plugin", value: "(skipped)" });
  }

  // MCP
  if (config.mcp === "global-hooks") {
    const hooksDir = config.hooks === "project"
      ? projectPaths.ourHooksDir
      : globalPaths.ourHooksDir;
    summary.push({ label: "MCP_WORKSPACE", value: hooksDir });
  } else if (config.mcp === "custom" && config.mcpPath) {
    summary.push({ label: "MCP_WORKSPACE", value: config.mcpPath });
  } else {
    summary.push({ label: "MCP", value: "(skipped)" });
  }

  return summary;
}

/**
 * Execute the installation with given configuration.
 */
async function executeInstall(projectDir: string, config: InstallConfig): Promise<void> {
  let hasErrors = false;
  const globalPaths = getGlobalPaths();
  const projectPaths = getProjectPaths(projectDir);

  // Step 1: Install hooks
  if (config.hooks !== "skip") {
    console.log("Installing hooks...");

    const hooksSource = findHooksSource(projectDir);
    if (!hooksSource) {
      console.log("✗ Could not find hooks in node_modules/claude-prompts/hooks");
      console.log("  Ensure 'claude-prompts' package is installed.\n");
      hasErrors = true;
    } else {
      const result = config.hooks === "global"
        ? installGlobalHooks(projectDir)
        : installProjectHooks(projectDir);

      if (result.success) {
        const path = config.hooks === "global"
          ? globalPaths.ourHooksDir
          : projectPaths.ourHooksDir;
        console.log(`✓ Installed hooks to ${path}`);
      } else {
        console.log(`✗ ${result.message}`);
        hasErrors = true;
      }
    }
    console.log();
  }

  // Step 2: Plugin registration
  if (config.plugin !== "skip") {
    console.log("Registering plugin...");

    const result = config.plugin === "global"
      ? installPluginRegistration()
      : installPluginRegistrationToProject(projectDir);

    if (result.success) {
      if (result.skipped) {
        console.log("✓ Plugin already registered");
      } else {
        console.log(`✓ Registered plugin in ${result.configPath}`);
      }
    } else {
      console.log(`✗ ${result.message}`);
      hasErrors = true;
    }
    console.log();
  }

  // Step 3: MCP configuration
  // MCP config goes to the same location as plugin registration
  if (config.mcp !== "skip") {
    console.log("Configuring MCP server...");

    let mcpWorkspace: string;
    if (config.mcp === "global-hooks") {
      mcpWorkspace = config.hooks === "project"
        ? projectPaths.ourHooksDir
        : globalPaths.ourHooksDir;
    } else if (config.mcp === "custom" && config.mcpPath) {
      mcpWorkspace = config.mcpPath;
    } else {
      mcpWorkspace = globalPaths.ourHooksDir;
    }

    // Route MCP config to same location as plugin registration
    const result = config.plugin === "global"
      ? installMcpConfigToGlobal(mcpWorkspace)
      : installMcpConfigToProject(projectDir, mcpWorkspace);

    const location = config.plugin === "global" ? "global" : "project";
    if (result.success) {
      console.log(`✓ MCP configured in ${location} config with MCP_WORKSPACE=${mcpWorkspace}`);
    } else {
      console.log(`✗ ${result.message}`);
      hasErrors = true;
    }
    console.log();
  }

  // Summary
  if (hasErrors) {
    console.log("Installation completed with errors.");
    console.log("Some features may not work correctly.\n");
    process.exit(1);
  }

  console.log("✓ Installation complete!\n");

  console.log("To verify installation:");
  console.log("  1. Restart OpenCode");
  console.log("  2. Try: >>diagnose to test the setup");
  if (config.hooks === "global") {
    console.log("  3. Check hooks: cat ~/.claude/hooks/hooks.json");
  }
  console.log();
}

function showInstallHelp(): void {
  console.log(`
opencode-prompts install - Interactive setup wizard

Usage: opencode-prompts install [options]

Options:
  --help, -h      Show this help message
  --yes, -y       Skip prompts, use defaults (non-interactive)

Description:
  Launches an interactive wizard to configure:

  1. Hooks - Chain tracking, gate reminders, state preservation
     • Global: ~/.claude/hooks/claude-prompts/
     • Project: ./.claude/hooks/claude-prompts/

  2. Plugin Registration - Register with OpenCode
     • Global: ~/.config/opencode/opencode.json
     • Project: ./opencode.json

  3. MCP Server - prompt_engine tools
     • Configure MCP_WORKSPACE path

  The wizard lets you choose locations for each component.
  Use --yes to accept all defaults for scripted installs.

Examples:
  opencode-prompts install      # Interactive wizard
  npx opencode-prompts install  # Via npx
  opencode-prompts install -y   # Non-interactive (defaults)
`);
}
