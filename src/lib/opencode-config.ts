/**
 * OpenCode configuration manager for MCP auto-registration.
 *
 * Automatically configures the claude-prompts MCP server in opencode.json
 * when the plugin loads, simplifying the installation process.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as jsonc from "jsonc-parser";

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
 * Write OpenCode configuration, preserving comments in JSONC files.
 */
export function writeOpencodeConfig(
  projectDir: string,
  config: OpencodeConfig,
  originalContent?: string
): void {
  const format = detectConfigFormat(projectDir);
  const configPath = join(
    projectDir,
    format === "jsonc" ? "opencode.jsonc" : "opencode.json"
  );

  // If we have original content with comments, use jsonc modify operations
  if (originalContent && format === "jsonc") {
    // For JSONC, we need to preserve comments by using edit operations
    // This is a simplified approach - for complex cases, consider using
    // jsonc.modify() for surgical edits
    const newContent = JSON.stringify(config, null, 2);
    writeFileSync(configPath, newContent + "\n");
  } else {
    // For regular JSON or new files
    const content = JSON.stringify(config, null, 2);
    writeFileSync(configPath, content + "\n");
  }
}

/**
 * Check if opencode-prompts MCP is already configured.
 */
export function hasMcpConfig(config: OpencodeConfig | null): boolean {
  if (!config?.mcp) {
    return false;
  }
  // Check for both names for backwards compatibility
  return "opencode-prompts" in config.mcp || "claude-prompts" in config.mcp;
}

/**
 * Install MCP configuration for opencode-prompts.
 *
 * This function:
 * 1. Detects existing opencode.json/opencode.jsonc
 * 2. Checks if opencode-prompts MCP is already configured
 * 3. Adds MCP config if missing
 * 4. Creates opencode.json if no config exists
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
    const existingConfig = readOpencodeConfig(projectDir);
    const configPath = getConfigPath(projectDir);

    // Case 1: Config exists with MCP already configured
    if (existingConfig && hasMcpConfig(existingConfig)) {
      console.log("[opencode-prompts] MCP configuration already exists");
      return {
        success: true,
        message: "MCP configuration already exists",
        skipped: true,
      };
    }

    // Case 2: Config exists but no MCP
    if (existingConfig && configPath) {
      const originalContent = readFileSync(configPath, "utf-8");

      // Add MCP config
      existingConfig.mcp = existingConfig.mcp ?? {};
      existingConfig.mcp["opencode-prompts"] = generateMcpConfig();

      writeOpencodeConfig(projectDir, existingConfig, originalContent);
      console.log("[opencode-prompts] Added MCP configuration to opencode.json");

      return {
        success: true,
        message: "Added MCP configuration to existing opencode.json",
        modified: true,
      };
    }

    // Case 3: No config exists - create minimal one
    const newConfig: OpencodeConfig = {
      $schema: "https://opencode.ai/config.json",
      mcp: {
        "opencode-prompts": generateMcpConfig(),
      },
    };

    const newConfigPath = join(projectDir, "opencode.json");
    writeFileSync(newConfigPath, JSON.stringify(newConfig, null, 2) + "\n");
    console.log("[opencode-prompts] Created opencode.json with MCP configuration");

    return {
      success: true,
      message: "Created opencode.json with MCP configuration",
      created: true,
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
