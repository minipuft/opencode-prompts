/**
 * OpenCode Plugin Validation Tests
 *
 * Validates plugin structure, configuration, and critical dependencies.
 */

import { existsSync, lstatSync, readFileSync } from "fs";
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
    expect(config.mcp["opencode-prompts"]).toBeDefined();
    expect(config.mcp["opencode-prompts"].command).toBe("node");
  });

  it("has plugin entry point", () => {
    const pluginPath = join(ROOT, ".opencode", "plugin", "index.ts");
    expect(existsSync(pluginPath)).toBe(true);
  });

  it("has .opencode/package.json", () => {
    const pkgPath = join(ROOT, ".opencode", "package.json");
    expect(existsSync(pkgPath)).toBe(true);
  });

  it("has core submodule", () => {
    const corePath = join(ROOT, "core");
    expect(existsSync(corePath)).toBe(true);
    expect(existsSync(join(corePath, ".git"))).toBe(true);
  });

  it("has server symlink pointing to core/server", () => {
    const serverPath = join(ROOT, "server");
    expect(existsSync(serverPath)).toBe(true);

    const stats = lstatSync(serverPath);
    expect(stats.isSymbolicLink()).toBe(true);
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

describe("Core Server Integration", () => {
  const serverDir = join(ROOT, "core", "server");

  it("has server dist bundle", () => {
    const distPath = join(serverDir, "dist", "index.js");
    expect(existsSync(distPath)).toBe(true);
  });

  it("has server package.json", () => {
    const pkgPath = join(serverDir, "package.json");
    expect(existsSync(pkgPath)).toBe(true);

    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    expect(pkg.name).toBe("claude-prompts");
  });
});

describe("CI/CD Configuration", () => {
  const workflowsDir = join(ROOT, ".github", "workflows");

  it("has CI workflow", () => {
    expect(existsSync(join(workflowsDir, "ci.yml"))).toBe(true);
  });

  it("has update-submodule workflow", () => {
    expect(existsSync(join(workflowsDir, "update-submodule.yml"))).toBe(true);
  });
});
