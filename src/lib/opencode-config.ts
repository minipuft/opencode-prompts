/**
 * OpenCode configuration manager for plugin registration and MCP auto-registration.
 *
 * Supports both:
 * - Global plugin registration in ~/.config/opencode/opencode.json(c)
 * - Project-level MCP configuration in ./opencode.json(c)
 *
 * Uses surgical JSON/JSONC modification to preserve comments and formatting.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import * as jsonc from "jsonc-parser";

// =============================================================================
// Surgical JSON/JSONC Modification
// =============================================================================

/**
 * Default formatting options for JSON modifications.
 */
const FORMATTING_OPTIONS: jsonc.FormattingOptions = {
  tabSize: 2,
  insertSpaces: true,
  eol: "\n",
};

/**
 * Surgically modify a JSON/JSONC file at a specific path.
 * Preserves comments and formatting.
 *
 * @param originalText - Original file content
 * @param path - JSON path to modify (e.g., ["plugin"] or ["mcp", "opencode-prompts"])
 * @param value - New value to set at path
 * @returns Modified text
 */
function surgicalModify(
  originalText: string,
  path: jsonc.JSONPath,
  value: unknown
): string {
  const edits = jsonc.modify(originalText, path, value, {
    formattingOptions: FORMATTING_OPTIONS,
  });
  return jsonc.applyEdits(originalText, edits);
}

// =============================================================================
// Constants
// =============================================================================

const GLOBAL_CONFIG_DIR = join(homedir(), ".config", "opencode");
const PLUGIN_NAME = "opencode-prompts";

/**
 * MCP server configuration structure.
 */
export interface McpServerConfig {
  type: "local" | "remote";
  command?: string[];
  url?: string;
  environment?: Record<string, string>;
  enabled?: boolean;
}

/**
 * OpenCode configuration structure.
 */
export interface OpencodeConfig {
  $schema?: string;
  mcp?: Record<string, McpServerConfig>;
  plugin?: string[];
  [key: string]: unknown;
}

/**
 * Result of an MCP configuration operation.
 */
export interface McpConfigResult {
  success: boolean;
  message: string;
  created?: boolean;
  modified?: boolean;
  skipped?: boolean;
}

/**
 * Default MCP configuration for claude-prompts.
 */
function generateMcpConfig(): McpServerConfig {
  return {
    type: "local",
    command: ["npx", "claude-prompts", "--transport=stdio"],
    environment: {
      MCP_WORKSPACE: "./node_modules/claude-prompts",
    },
  };
}

/**
 * Detect OpenCode config format (json or jsonc).
 */
export function detectConfigFormat(projectDir: string): "json" | "jsonc" | null {
  if (existsSync(join(projectDir, "opencode.jsonc"))) {
    return "jsonc";
  }
  if (existsSync(join(projectDir, "opencode.json"))) {
    return "json";
  }
  return null;
}

/**
 * Get path to OpenCode config file.
 */
export function getConfigPath(projectDir: string): string | null {
  const format = detectConfigFormat(projectDir);
  if (!format) {
    return null;
  }
  return join(projectDir, format === "jsonc" ? "opencode.jsonc" : "opencode.json");
}

/**
 * Read OpenCode configuration.
 */
export function readOpencodeConfig(projectDir: string): OpencodeConfig | null {
  const configPath = getConfigPath(projectDir);
  if (!configPath) {
    return null;
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    // Use jsonc-parser to handle comments in JSONC files
    const errors: jsonc.ParseError[] = [];
    const config = jsonc.parse(content, errors) as OpencodeConfig;

    if (errors.length > 0) {
      console.log(`[opencode-prompts] Warning: Parse errors in ${configPath}`);
      return null;
    }

    return config;
  } catch {
    return null;
  }
}

/**
 * Check if opencode-prompts MCP is already configured in a specific config.
 */
export function hasMcpConfig(config: OpencodeConfig | null): boolean {
  if (!config?.mcp) {
    return false;
  }
  // Check for both names for backwards compatibility
  return "opencode-prompts" in config.mcp || "claude-prompts" in config.mcp;
}

/**
 * Check if opencode-prompts MCP is configured in either project or global config.
 *
 * This respects OpenCode's config priority order:
 *   Project config > Global config
 *
 * If MCP is configured globally, we should NOT create a project config
 * that would override it with default values.
 */
export function hasMcpConfigAnywhere(projectDir: string | undefined): boolean {
  // Check project config first
  if (projectDir) {
    const projectConfig = readOpencodeConfig(projectDir);
    if (hasMcpConfig(projectConfig)) {
      return true;
    }
  }

  // Check global config
  const globalConfig = readGlobalConfig();
  return hasMcpConfig(globalConfig);
}

/**
 * Install MCP configuration for opencode-prompts.
 *
 * This function respects OpenCode's config priority order:
 *   Project config > Global config
 *
 * It will NOT create a project config if MCP is already configured globally,
 * as that would override the user's global settings with defaults.
 *
 * Priority check order:
 * 1. Project config exists with MCP → skip (already configured)
 * 2. Global config exists with MCP → skip (respect user's global settings)
 * 3. Project config exists without MCP → add MCP to project
 * 4. No config exists → skip (don't create unnecessary project config)
 *
 * @param projectDir - Project root directory
 */
export function installMcpConfig(projectDir: string | undefined): McpConfigResult {
  if (!projectDir) {
    return {
      success: false,
      message: "No project directory provided",
    };
  }

  try {
    const existingProjectConfig = readOpencodeConfig(projectDir);
    const existingProjectPath = getConfigPath(projectDir);
    const existingGlobalConfig = readGlobalConfig();

    // Case 1: Project config exists with MCP already configured
    if (existingProjectConfig && hasMcpConfig(existingProjectConfig)) {
      console.log("[opencode-prompts] MCP configuration already exists in project config");
      return {
        success: true,
        message: "MCP configuration already exists in project config",
        skipped: true,
      };
    }

    // Case 2: Global config has MCP configured - respect it, don't override
    if (hasMcpConfig(existingGlobalConfig)) {
      console.log("[opencode-prompts] MCP configuration exists in global config, respecting user settings");
      return {
        success: true,
        message: "MCP configuration exists in global config",
        skipped: true,
      };
    }

    // Case 3: Project config exists but no MCP anywhere - add to project
    if (existingProjectConfig && existingProjectPath) {
      const mcpConfig = generateMcpConfig();
      surgicalModifyProjectConfig(existingProjectPath, ["mcp", "opencode-prompts"], mcpConfig);
      console.log("[opencode-prompts] Added MCP configuration to opencode.json");

      return {
        success: true,
        message: "Added MCP configuration to existing opencode.json",
        modified: true,
      };
    }

    // Case 4: No config exists anywhere - skip creating project config
    // Let the user configure via CLI install wizard or manual setup
    console.log("[opencode-prompts] No existing config found, skipping auto-config");
    console.log("[opencode-prompts] Run 'opencode-prompts install' for guided setup");
    return {
      success: true,
      message: "No existing config found, skipping auto-config (run 'opencode-prompts install' for setup)",
      skipped: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`[opencode-prompts] Could not setup MCP config: ${message}`);

    return {
      success: false,
      message: `Could not setup MCP config: ${message}`,
    };
  }
}

// =============================================================================
// Global Plugin Registration (~/.config/opencode/)
// =============================================================================

/**
 * Result of a plugin registration operation.
 */
export interface PluginConfigResult {
  success: boolean;
  message: string;
  created?: boolean;
  modified?: boolean;
  skipped?: boolean;
  configPath?: string;
}

/**
 * Get path to global OpenCode config file.
 * Checks for opencode.jsonc first, then opencode.json.
 */
export function getGlobalConfigPath(): string | null {
  const jsoncPath = join(GLOBAL_CONFIG_DIR, "opencode.jsonc");
  if (existsSync(jsoncPath)) {
    return jsoncPath;
  }

  const jsonPath = join(GLOBAL_CONFIG_DIR, "opencode.json");
  if (existsSync(jsonPath)) {
    return jsonPath;
  }

  return null;
}

/**
 * Read global OpenCode configuration.
 *
 * Note: We intentionally ignore non-critical parse errors (like comment syntax)
 * since jsonc-parser still returns usable config even with minor issues.
 * Only return null if config is completely unparseable or file doesn't exist.
 */
export function readGlobalConfig(): OpencodeConfig | null {
  const configPath = getGlobalConfigPath();
  if (!configPath) {
    return null;
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    const errors: jsonc.ParseError[] = [];
    const config = jsonc.parse(content, errors) as OpencodeConfig;

    // Only fail on critical errors that prevent config from being usable
    // jsonc-parser returns partial results even with minor errors
    if (!config || typeof config !== "object") {
      return null;
    }

    return config;
  } catch {
    return null;
  }
}

/**
 * Write global OpenCode configuration surgically.
 * For new files, creates with JSON.stringify.
 * For existing files, use surgicalModifyGlobalConfig instead.
 */
export function writeGlobalConfig(config: OpencodeConfig, configPath: string): void {
  // Ensure directory exists
  mkdirSync(GLOBAL_CONFIG_DIR, { recursive: true });

  const content = JSON.stringify(config, null, 2);
  writeFileSync(configPath, content + "\n");
}

/**
 * Surgically modify global config at a specific path.
 * Preserves comments and formatting.
 */
function surgicalModifyGlobalConfig(
  configPath: string,
  path: jsonc.JSONPath,
  value: unknown
): void {
  mkdirSync(GLOBAL_CONFIG_DIR, { recursive: true });
  const text = readFileSync(configPath, "utf-8");
  const newText = surgicalModify(text, path, value);
  writeFileSync(configPath, newText);
}

/**
 * Check if opencode-prompts is registered in the plugin array.
 */
export function hasPluginRegistration(config: OpencodeConfig | null): boolean {
  if (!config?.plugin || !Array.isArray(config.plugin)) {
    return false;
  }
  return config.plugin.some((p) => p === PLUGIN_NAME || p.startsWith(`${PLUGIN_NAME}@`));
}

/**
 * Install plugin registration in global config.
 *
 * Adds "opencode-prompts" to the plugin array in ~/.config/opencode/opencode.json(c).
 * Uses surgical modification to preserve comments and formatting.
 */
export function installPluginRegistration(): PluginConfigResult {
  try {
    const existingPath = getGlobalConfigPath();
    const configPath = existingPath ?? join(GLOBAL_CONFIG_DIR, "opencode.json");
    const existingConfig = readGlobalConfig();

    // Already registered
    if (existingConfig && hasPluginRegistration(existingConfig)) {
      return {
        success: true,
        message: "Plugin already registered in global config",
        skipped: true,
        configPath,
      };
    }

    // Add to existing config (surgical modification)
    if (existingConfig && existingPath) {
      const newPluginArray = [...(existingConfig.plugin ?? []), PLUGIN_NAME];
      surgicalModifyGlobalConfig(existingPath, ["plugin"], newPluginArray);

      return {
        success: true,
        message: `Added ${PLUGIN_NAME} to plugin array in ${configPath}`,
        modified: true,
        configPath,
      };
    }

    // Create new config
    const newConfig: OpencodeConfig = {
      $schema: "https://opencode.ai/config.json",
      plugin: [PLUGIN_NAME],
    };

    writeGlobalConfig(newConfig, configPath);

    return {
      success: true,
      message: `Created ${configPath} with plugin registration`,
      created: true,
      configPath,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Failed to register plugin: ${message}`,
    };
  }
}

/**
 * Remove plugin registration from global config.
 * Uses surgical modification to preserve comments and formatting.
 */
export function removePluginRegistration(): PluginConfigResult {
  try {
    const configPath = getGlobalConfigPath();
    if (!configPath) {
      return {
        success: true,
        message: "No global config found, nothing to remove",
        skipped: true,
      };
    }

    const config = readGlobalConfig();
    if (!config || !hasPluginRegistration(config)) {
      return {
        success: true,
        message: "Plugin not registered in global config",
        skipped: true,
        configPath,
      };
    }

    // Remove from plugin array (surgical modification)
    const filteredPlugins = config.plugin?.filter(
      (p) => p !== PLUGIN_NAME && !p.startsWith(`${PLUGIN_NAME}@`)
    ) ?? [];

    // Set to filtered array or undefined if empty
    const newValue = filteredPlugins.length > 0 ? filteredPlugins : undefined;
    surgicalModifyGlobalConfig(configPath, ["plugin"], newValue);

    return {
      success: true,
      message: `Removed ${PLUGIN_NAME} from plugin array`,
      modified: true,
      configPath,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Failed to remove plugin registration: ${message}`,
    };
  }
}

// =============================================================================
// Project-Level Plugin Registration (./opencode.json)
// =============================================================================

/**
 * Surgically modify project config at a specific path.
 * Preserves comments and formatting.
 */
function surgicalModifyProjectConfig(
  configPath: string,
  path: jsonc.JSONPath,
  value: unknown
): void {
  const text = readFileSync(configPath, "utf-8");
  const newText = surgicalModify(text, path, value);
  writeFileSync(configPath, newText);
}

/**
 * Install plugin registration in project config.
 *
 * Adds "opencode-prompts" to the plugin array in ./opencode.json(c).
 * Uses surgical modification to preserve comments and formatting.
 */
export function installPluginRegistrationToProject(projectDir: string): PluginConfigResult {
  try {
    const existingPath = getConfigPath(projectDir);
    const configPath = existingPath ?? join(projectDir, "opencode.json");
    const existingConfig = readOpencodeConfig(projectDir);

    // Already registered
    if (existingConfig && hasPluginRegistration(existingConfig)) {
      return {
        success: true,
        message: "Plugin already registered in project config",
        skipped: true,
        configPath,
      };
    }

    // Add to existing config (surgical modification)
    if (existingConfig && existingPath) {
      const newPluginArray = [...(existingConfig.plugin ?? []), PLUGIN_NAME];
      surgicalModifyProjectConfig(existingPath, ["plugin"], newPluginArray);

      return {
        success: true,
        message: `Added ${PLUGIN_NAME} to plugin array in ${configPath}`,
        modified: true,
        configPath,
      };
    }

    // Create new config
    const newConfig: OpencodeConfig = {
      $schema: "https://opencode.ai/config.json",
      plugin: [PLUGIN_NAME],
    };

    writeFileSync(configPath, JSON.stringify(newConfig, null, 2) + "\n");

    return {
      success: true,
      message: `Created ${configPath} with plugin registration`,
      created: true,
      configPath,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Failed to register plugin in project: ${message}`,
    };
  }
}

/**
 * Remove plugin registration from project config.
 * Uses surgical modification to preserve comments and formatting.
 */
export function removePluginRegistrationFromProject(projectDir: string): PluginConfigResult {
  try {
    const configPath = getConfigPath(projectDir);
    if (!configPath) {
      return {
        success: true,
        message: "No project config found, nothing to remove",
        skipped: true,
      };
    }

    const config = readOpencodeConfig(projectDir);
    if (!config || !hasPluginRegistration(config)) {
      return {
        success: true,
        message: "Plugin not registered in project config",
        skipped: true,
        configPath,
      };
    }

    // Remove from plugin array (surgical modification)
    const filteredPlugins = config.plugin?.filter(
      (p) => p !== PLUGIN_NAME && !p.startsWith(`${PLUGIN_NAME}@`)
    ) ?? [];

    // Set to filtered array or undefined if empty
    const newValue = filteredPlugins.length > 0 ? filteredPlugins : undefined;
    surgicalModifyProjectConfig(configPath, ["plugin"], newValue);

    return {
      success: true,
      message: `Removed ${PLUGIN_NAME} from project plugin array`,
      modified: true,
      configPath,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Failed to remove plugin from project: ${message}`,
    };
  }
}

// =============================================================================
// MCP Configuration with Custom Workspace
// =============================================================================

/**
 * Generate MCP config with custom workspace path.
 */
function generateMcpConfigWithWorkspace(mcpWorkspace: string): McpServerConfig {
  return {
    type: "local",
    command: ["npx", "claude-prompts", "--transport=stdio"],
    environment: {
      MCP_WORKSPACE: mcpWorkspace,
    },
  };
}

/**
 * Install MCP configuration to global config.
 * Uses surgical modification to preserve comments and formatting.
 *
 * @param mcpWorkspace - Path to set as MCP_WORKSPACE
 */
export function installMcpConfigToGlobal(mcpWorkspace: string): McpConfigResult {
  try {
    const existingConfig = readGlobalConfig();
    const existingPath = getGlobalConfigPath();
    const configPath = existingPath ?? join(GLOBAL_CONFIG_DIR, "opencode.json");

    // Config exists with MCP already configured - update workspace path
    if (existingConfig && existingPath && hasMcpConfig(existingConfig)) {
      const mcpConfig = generateMcpConfigWithWorkspace(mcpWorkspace);
      surgicalModifyGlobalConfig(existingPath, ["mcp", "opencode-prompts"], mcpConfig);

      return {
        success: true,
        message: "Updated MCP_WORKSPACE in global config",
        modified: true,
      };
    }

    // Config exists but no MCP - add MCP entry
    if (existingConfig && existingPath) {
      const mcpConfig = generateMcpConfigWithWorkspace(mcpWorkspace);
      surgicalModifyGlobalConfig(existingPath, ["mcp", "opencode-prompts"], mcpConfig);

      return {
        success: true,
        message: "Added MCP configuration to global opencode.json",
        modified: true,
      };
    }

    // No config exists - create minimal one
    const newConfig: OpencodeConfig = {
      $schema: "https://opencode.ai/config.json",
      mcp: {
        "opencode-prompts": generateMcpConfigWithWorkspace(mcpWorkspace),
      },
    };

    mkdirSync(GLOBAL_CONFIG_DIR, { recursive: true });
    writeFileSync(configPath, JSON.stringify(newConfig, null, 2) + "\n");

    return {
      success: true,
      message: "Created global opencode.json with MCP configuration",
      created: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Could not setup global MCP config: ${message}`,
    };
  }
}

/**
 * Install MCP configuration to project config.
 * Uses surgical modification to preserve comments and formatting.
 *
 * @param projectDir - Project directory (cwd) for config file
 * @param mcpWorkspace - Path to set as MCP_WORKSPACE
 */
export function installMcpConfigToProject(
  projectDir: string,
  mcpWorkspace: string
): McpConfigResult {
  try {
    const existingConfig = readOpencodeConfig(projectDir);
    const existingPath = getConfigPath(projectDir);

    // Config exists with MCP already configured - update workspace path
    if (existingConfig && existingPath && hasMcpConfig(existingConfig)) {
      const mcpConfig = generateMcpConfigWithWorkspace(mcpWorkspace);
      surgicalModifyProjectConfig(existingPath, ["mcp", "opencode-prompts"], mcpConfig);

      return {
        success: true,
        message: "Updated MCP_WORKSPACE in existing config",
        modified: true,
      };
    }

    // Config exists but no MCP - add MCP entry
    if (existingConfig && existingPath) {
      const mcpConfig = generateMcpConfigWithWorkspace(mcpWorkspace);
      surgicalModifyProjectConfig(existingPath, ["mcp", "opencode-prompts"], mcpConfig);

      return {
        success: true,
        message: "Added MCP configuration to existing opencode.json",
        modified: true,
      };
    }

    // No config exists - create minimal one
    const newConfig: OpencodeConfig = {
      $schema: "https://opencode.ai/config.json",
      mcp: {
        "opencode-prompts": generateMcpConfigWithWorkspace(mcpWorkspace),
      },
    };

    const newConfigPath = join(projectDir, "opencode.json");
    writeFileSync(newConfigPath, JSON.stringify(newConfig, null, 2) + "\n");

    return {
      success: true,
      message: "Created opencode.json with MCP configuration",
      created: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Could not setup MCP config: ${message}`,
    };
  }
}

/**
 * Remove MCP configuration from project.
 * Uses surgical modification to preserve comments and formatting.
 */
export function removeMcpConfigFromProject(projectDir: string): McpConfigResult {
  try {
    const existingConfig = readOpencodeConfig(projectDir);
    const configPath = getConfigPath(projectDir);

    if (!existingConfig || !configPath) {
      return {
        success: true,
        message: "No project config found",
        skipped: true,
      };
    }

    if (!hasMcpConfig(existingConfig)) {
      return {
        success: true,
        message: "No MCP configuration found",
        skipped: true,
      };
    }

    // Remove MCP entries surgically
    // First remove opencode-prompts
    surgicalModifyProjectConfig(configPath, ["mcp", "opencode-prompts"], undefined);

    // Re-read to check for claude-prompts (legacy name)
    const updatedConfig = readOpencodeConfig(projectDir);
    if (updatedConfig?.mcp?.["claude-prompts"]) {
      surgicalModifyProjectConfig(configPath, ["mcp", "claude-prompts"], undefined);
    }

    // Check if mcp is now empty and remove it
    const finalConfig = readOpencodeConfig(projectDir);
    if (finalConfig?.mcp && Object.keys(finalConfig.mcp).length === 0) {
      surgicalModifyProjectConfig(configPath, ["mcp"], undefined);
    }

    return {
      success: true,
      message: "Removed MCP configuration from project",
      modified: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Could not remove project MCP config: ${message}`,
    };
  }
}

/**
 * Remove MCP configuration from global config.
 * Uses surgical modification to preserve comments and formatting.
 */
export function removeMcpConfigFromGlobal(): McpConfigResult {
  try {
    const existingConfig = readGlobalConfig();
    const configPath = getGlobalConfigPath();

    if (!existingConfig || !configPath) {
      return {
        success: true,
        message: "No global config found",
        skipped: true,
      };
    }

    if (!hasMcpConfig(existingConfig)) {
      return {
        success: true,
        message: "No MCP configuration found in global config",
        skipped: true,
      };
    }

    // Remove MCP entries surgically
    // First remove opencode-prompts
    surgicalModifyGlobalConfig(configPath, ["mcp", "opencode-prompts"], undefined);

    // Re-read to check for claude-prompts (legacy name)
    const updatedConfig = readGlobalConfig();
    if (updatedConfig?.mcp?.["claude-prompts"]) {
      surgicalModifyGlobalConfig(configPath, ["mcp", "claude-prompts"], undefined);
    }

    // Check if mcp is now empty and remove it
    const finalConfig = readGlobalConfig();
    if (finalConfig?.mcp && Object.keys(finalConfig.mcp).length === 0) {
      surgicalModifyGlobalConfig(configPath, ["mcp"], undefined);
    }

    return {
      success: true,
      message: "Removed MCP configuration from global config",
      modified: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Could not remove global MCP config: ${message}`,
    };
  }
}
