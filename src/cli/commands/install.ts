/**
 * Install command for opencode-prompts CLI.
 *
 * Provides an interactive wizard to set up:
 * 1. Plugin registration (global or project)
 * 2. MCP server configuration with custom workspace
 *
 * Enforcement runs through OpenCode's native plugin API (.opencode/plugin) —
 * no Claude Code hook files are installed.
 */

import { resolve } from "node:path";
import {
  runWizardStep,
  confirmWizard,
  type WizardStep,
} from "../wizard.js";
import {
  installPluginRegistration,
  installPluginRegistrationToProject,
  installMcpConfigToGlobal,
  installMcpConfigToProject,
} from "../../lib/opencode-config.js";
import { detectExistingInstallation } from "../../lib/detect-installation.js";

/** Default MCP_WORKSPACE: the bundled claude-prompts server inside this package. */
const DEFAULT_MCP_WORKSPACE = "./node_modules/claude-prompts";

/**
 * Install configuration choices.
 */
interface InstallConfig {
  plugin: "global" | "project" | "skip";
  mcp: "default" | "custom" | "skip";
  mcpPath?: string;
}

/**
 * Default configuration values.
 */
const DEFAULTS: InstallConfig = {
  plugin: "global",
  mcp: "default",
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
    const wizardConfig = await runInstallWizard();
    const summary = buildSummary(wizardConfig);

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
async function runInstallWizard(): Promise<InstallConfig> {
  // Step 1: Plugin Registration
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

  const pluginChoice = await runWizardStep(pluginStep, 1, 2);

  // Step 2: MCP Configuration
  const mcpStep: WizardStep = {
    id: "mcp",
    title: "MCP SERVER",
    description: "Configure MCP server for prompt_engine tools?",
    choices: [
      {
        key: "1",
        label: `Bundled server (${DEFAULT_MCP_WORKSPACE})`,
        value: "default",
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

  const mcpChoice = await runWizardStep(mcpStep, 2, 2);

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
    plugin: pluginChoice as InstallConfig["plugin"],
    mcp: mcpValue,
    mcpPath,
  };
}

/**
 * Build summary for confirmation.
 */
function buildSummary(
  config: InstallConfig
): { label: string; value: string }[] {
  const summary: { label: string; value: string }[] = [];

  // Plugin
  if (config.plugin === "global") {
    summary.push({ label: "Plugin", value: "~/.config/opencode/opencode.json" });
  } else if (config.plugin === "project") {
    summary.push({ label: "Plugin", value: "./opencode.json" });
  } else {
    summary.push({ label: "Plugin", value: "(skipped)" });
  }

  // MCP
  if (config.mcp === "default") {
    summary.push({ label: "MCP_WORKSPACE", value: DEFAULT_MCP_WORKSPACE });
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

  // Step 1: Plugin registration
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

  // Step 2: MCP configuration
  // MCP config goes to the same location as plugin registration
  if (config.mcp !== "skip") {
    console.log("Configuring MCP server...");

    let mcpWorkspace: string;
    if (config.mcp === "default") {
      mcpWorkspace = DEFAULT_MCP_WORKSPACE;
    } else if (config.mcp === "custom" && config.mcpPath) {
      mcpWorkspace = config.mcpPath;
    } else {
      mcpWorkspace = DEFAULT_MCP_WORKSPACE;
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

  1. Plugin Registration - Register with OpenCode
     • Global: ~/.config/opencode/opencode.json
     • Project: ./opencode.json

  2. MCP Server - prompt_engine tools
     • Bundled server: ./node_modules/claude-prompts
     • Or a custom MCP_WORKSPACE path

  Gate enforcement, chain tracking, and state preservation run through
  OpenCode's native plugin API — no separate hook files are installed.

Examples:
  opencode-prompts install      # Interactive wizard
  npx opencode-prompts install  # Via npx
  opencode-prompts install -y   # Non-interactive (defaults)
`);
}
