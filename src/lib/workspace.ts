/**
 * Workspace resolution for OpenCode prompts plugin.
 *
 * Priority:
 *   1. MCP_WORKSPACE - User-defined workspace location
 *   2. OPENCODE_PLUGIN_ROOT - Set by OpenCode plugin system (if available)
 *   3. projectDir - Provided by OpenCode plugin context
 *   4. Self-resolution - Detect from import.meta.url (zero-config fallback)
 */

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Get the plugin workspace root directory.
 *
 * @param projectDir - Optional project directory from OpenCode context
 * @returns Resolved workspace path or null
 */
export function getWorkspaceRoot(projectDir?: string): string | null {
  // 1. User-defined workspace (highest priority)
  const mcpWorkspace = process.env.MCP_WORKSPACE;
  if (mcpWorkspace && existsSync(mcpWorkspace)) {
    return mcpWorkspace;
  }

  // 2. OpenCode plugin root (if set by plugin system)
  const opencodeRoot = process.env.OPENCODE_PLUGIN_ROOT;
  if (opencodeRoot && existsSync(opencodeRoot)) {
    return opencodeRoot;
  }

  // 3. Project directory from OpenCode context
  if (projectDir && existsSync(projectDir)) {
    return projectDir;
  }

  // 4. Self-resolution from script location
  // src/lib/workspace.ts -> lib -> src -> project_root
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const projectRoot = resolve(__dirname, "..", "..");
    if (existsSync(join(projectRoot, "server"))) {
      return projectRoot;
    }
  } catch {
    // import.meta.url not available in all contexts
  }

  return null;
}

/**
 * Get the server directory (contains cache, resources, etc.).
 */
export function getServerDir(
  fallback: string,
  projectDir?: string
): string {
  const workspace = getWorkspaceRoot(projectDir);
  if (workspace) {
    return join(workspace, "server");
  }
  return fallback;
}

/**
 * Get the cache directory for prompt/gate caches.
 */
export function getCacheDir(
  fallback: string,
  projectDir?: string
): string {
  const workspace = getWorkspaceRoot(projectDir);
  if (workspace) {
    return join(workspace, "server", "cache");
  }
  return fallback;
}

/**
 * Get the runtime-state directory for transient state files.
 */
export function getRuntimeStateDir(
  fallback: string,
  projectDir?: string
): string {
  const workspace = getWorkspaceRoot(projectDir);
  if (workspace) {
    return join(workspace, "runtime-state");
  }
  return fallback;
}
