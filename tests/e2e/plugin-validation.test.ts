/**
 * OpenCode Plugin Validation Tests
 *
 * Validates plugin structure, configuration, and critical dependencies.
 */

import { existsSync, readFileSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..", "..");

describe("OpenCode Plugin Structure", () => {
  it("has opencode.json configuration", () => {
    const configPath = join(ROOT, "opencode.json");
    expect(existsSync(configPath)).toBe(true);

    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(config.mcp).toBeDefined();
    // MCP server is registered as "opencode-prompts" (unified naming)
    expect(config.mcp["opencode-prompts"]).toBeDefined();
    // Uses npx to run claude-prompts MCP server from node_modules
    expect(config.mcp["opencode-prompts"].command).toContain("npx");
  });

  it("has plugin entry point", () => {
    const pluginPath = join(ROOT, ".opencode", "plugin", "index.ts");
    expect(existsSync(pluginPath)).toBe(true);
  });

  it("has .opencode/package.json", () => {
    const pkgPath = join(ROOT, ".opencode", "package.json");
    expect(existsSync(pkgPath)).toBe(true);
  });

  it("has claude-prompts as npm dependency", () => {
    const pkgPath = join(ROOT, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    expect(pkg.dependencies?.["claude-prompts"]).toBeDefined();
  });
});

describe("TypeScript Library Modules", () => {
  const libDir = join(ROOT, "src", "lib");

  it("has types.ts", () => {
    expect(existsSync(join(libDir, "types.ts"))).toBe(true);
  });

  it("has workspace.ts", () => {
    expect(existsSync(join(libDir, "workspace.ts"))).toBe(true);
  });

  it("has cache-manager.ts", () => {
    expect(existsSync(join(libDir, "cache-manager.ts"))).toBe(true);
  });

  it("has session-state.ts", () => {
    expect(existsSync(join(libDir, "session-state.ts"))).toBe(true);
  });
});

describe("npm Dependency Integration", () => {
  // Note: These tests require `npm install` to have been run
  // In CI, this is done in the validate-plugin job
  const nodeModulesDir = join(ROOT, "node_modules", "claude-prompts");

  it("has claude-prompts package installed", () => {
    // This test will pass after npm install
    // Skip in development if node_modules doesn't exist
    if (!existsSync(join(ROOT, "node_modules"))) {
      console.log("Skipping: node_modules not present (run npm install)");
      return;
    }
    expect(existsSync(nodeModulesDir)).toBe(true);
  });

  it("has server dist bundle in node_modules", () => {
    if (!existsSync(nodeModulesDir)) {
      console.log("Skipping: claude-prompts not installed");
      return;
    }
    const distPath = join(nodeModulesDir, "dist", "index.js");
    expect(existsSync(distPath)).toBe(true);
  });

  it("has hooks directory in node_modules", () => {
    if (!existsSync(nodeModulesDir)) {
      console.log("Skipping: claude-prompts not installed");
      return;
    }
    const hooksPath = join(nodeModulesDir, "hooks");
    expect(existsSync(hooksPath)).toBe(true);
  });
});

describe("CI/CD Configuration", () => {
  const workflowsDir = join(ROOT, ".github", "workflows");

  it("has CI workflow", () => {
    expect(existsSync(join(workflowsDir, "ci.yml"))).toBe(true);
  });

  it("has npm-publish workflow", () => {
    expect(existsSync(join(workflowsDir, "npm-publish.yml"))).toBe(true);
  });

  it("does not have update-submodule workflow (deprecated)", () => {
    // Submodule sync is no longer needed - using npm dependencies instead
    expect(existsSync(join(workflowsDir, "update-submodule.yml"))).toBe(false);
  });
});
