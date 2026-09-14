/**
 * Install writes an MCP entry claude-prompts can start on (plan row 2.12).
 *
 * claude-prompts refuses a MCP_WORKSPACE that does not exist, and resolves a
 * relative one against the directory OpenCode starts it in. So the bundled
 * default writes no MCP_WORKSPACE, a custom path is stored absolute, a missing
 * custom path is refused before any config is written, and the legacy entry
 * older versions wrote is removed. MCP_RUNTIME_ROOT is always a per-user data
 * directory, so runtime state does not live in the npx cache.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

import type { InstallConfig } from "../../src/cli/commands/install.js";

const RELATIVE_DEFAULT = "./node_modules/claude-prompts";
const MCP_COMMAND = ["npx", "claude-prompts", "--transport=stdio"];
const LEGACY_ENTRY = {
  type: "local",
  command: MCP_COMMAND,
  environment: { MCP_WORKSPACE: RELATIVE_DEFAULT },
};

type Scope = "project" | "global";
type ExecuteInstall = (projectDir: string, config: InstallConfig) => Promise<void>;
type McpEntry = { command?: string[]; environment?: Record<string, string> };

const home = mkdtempSync(join(tmpdir(), "opencode-prompts-home-"));
const globalConfigDir = join(home, ".config", "opencode");
const defaultRuntimeRoot = join(home, ".local", "share", "opencode-prompts");
const originalDataHome = process.env.XDG_DATA_HOME;
let executeInstall: ExecuteInstall;
let projectDir: string;
let logged: string[];

function configPath(scope: Scope): string {
  return scope === "global"
    ? join(globalConfigDir, "opencode.json")
    : join(projectDir, "opencode.json");
}

function writeConfig(scope: Scope, mcp: Record<string, unknown>): void {
  const path = configPath(scope);
  mkdirSync(dirname(path), { recursive: true });
  const config = {
    $schema: "https://opencode.ai/config.json",
    plugin: ["opencode-prompts"],
    model: "keep-me",
    mcp,
  };
  writeFileSync(path, JSON.stringify(config, null, 2));
}

function readMcp(scope: Scope): Record<string, McpEntry> {
  return JSON.parse(readFileSync(configPath(scope), "utf-8")).mcp;
}

function readMcpEntry(scope: Scope): McpEntry {
  return readMcp(scope)["opencode-prompts"];
}

beforeAll(async () => {
  // The global config directory is derived from homedir() when the module loads. Setting
  // process.env.HOME does not reach node:os, because jest gives each test file a copy of
  // process.env, so homedir() is mocked before the module is imported.
  const os = await import("node:os");
  jest.unstable_mockModule("node:os", () => ({
    ...os,
    default: { ...os.default, homedir: () => home },
    homedir: () => home,
  }));
  ({ executeInstall } = await import("../../src/cli/commands/install.js"));

  // Refuse to run any case if global writes would reach the real home directory.
  const { getGlobalConfigPath } = await import("../../src/lib/opencode-config.js");
  const sentinel = join(globalConfigDir, "opencode.jsonc");
  mkdirSync(globalConfigDir, { recursive: true });
  writeFileSync(sentinel, "{}\n");
  const resolved = getGlobalConfigPath();
  rmSync(globalConfigDir, { recursive: true, force: true });
  if (resolved !== sentinel) {
    throw new Error(`global config resolves to ${resolved}, not the test home ${home}`);
  }
});

afterAll(() => {
  rmSync(home, { recursive: true, force: true });
});

beforeEach(() => {
  rmSync(join(home, ".config"), { recursive: true, force: true });
  // src reads XDG_DATA_HOME from the test file's process.env copy, so this reaches it.
  delete process.env.XDG_DATA_HOME;
  projectDir = mkdtempSync(join(tmpdir(), "opencode-prompts-project-"));
  logged = [];
  jest.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logged.push(args.join(" "));
  });
  jest.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`process.exit(${code})`);
  }) as typeof process.exit);
});

afterEach(() => {
  jest.restoreAllMocks();
  if (originalDataHome === undefined) {
    delete process.env.XDG_DATA_HOME;
  } else {
    process.env.XDG_DATA_HOME = originalDataHome;
  }
  rmSync(projectDir, { recursive: true, force: true });
});

describe.each<Scope>(["project", "global"])("install MCP workspace (%s scope)", (scope) => {
  it("writes only MCP_RUNTIME_ROOT, no MCP_WORKSPACE, for the bundled default", async () => {
    await executeInstall(projectDir, { plugin: scope, mcp: "default" });

    const entry = readMcpEntry(scope);
    expect(entry.command).toEqual(MCP_COMMAND);
    expect(entry.environment).toEqual({ MCP_RUNTIME_ROOT: defaultRuntimeRoot });
  });

  it("puts MCP_RUNTIME_ROOT under an absolute XDG_DATA_HOME", async () => {
    const dataHome = join(home, "xdg-data");
    process.env.XDG_DATA_HOME = dataHome;

    await executeInstall(projectDir, { plugin: scope, mcp: "default" });

    expect(readMcpEntry(scope).environment).toEqual({
      MCP_RUNTIME_ROOT: join(dataHome, "opencode-prompts"),
    });
  });

  it("removes the old relative default from an existing config on re-install", async () => {
    writeConfig(scope, { "opencode-prompts": LEGACY_ENTRY });

    await executeInstall(projectDir, { plugin: scope, mcp: "default" });

    const text = readFileSync(configPath(scope), "utf-8");
    expect(text).not.toContain(RELATIVE_DEFAULT);
    expect(readMcpEntry(scope).environment).toEqual({ MCP_RUNTIME_ROOT: defaultRuntimeRoot });
    expect(JSON.parse(text).model).toBe("keep-me");
  });

  it("removes a legacy claude-prompts entry that still has the plugin's old shape", async () => {
    writeConfig(scope, { "claude-prompts": LEGACY_ENTRY, other: { type: "remote", url: "u" } });

    await executeInstall(projectDir, { plugin: scope, mcp: "default" });

    const mcp = readMcp(scope);
    expect(mcp["claude-prompts"]).toBeUndefined();
    expect(mcp.other).toEqual({ type: "remote", url: "u" });
    expect(readFileSync(configPath(scope), "utf-8")).not.toContain(RELATIVE_DEFAULT);
    expect(logged.join("\n")).not.toContain('mcp["claude-prompts"]');
  });

  it("keeps a legacy claude-prompts entry that differs, warning with its key", async () => {
    const customised = { ...LEGACY_ENTRY, environment: { MCP_WORKSPACE: "/srv/prompts" } };
    writeConfig(scope, { "claude-prompts": customised });

    await executeInstall(projectDir, { plugin: scope, mcp: "default" });

    expect(readMcp(scope)["claude-prompts"]).toEqual(customised);
    expect(logged.join("\n")).toContain('⚠ Left mcp["claude-prompts"]');
  });

  it("stores a custom relative path absolute, resolved against the install directory", async () => {
    mkdirSync(join(projectDir, "workspace"));

    await executeInstall(projectDir, { plugin: scope, mcp: "custom", mcpPath: "./workspace" });

    const environment = readMcpEntry(scope).environment;
    expect(environment).toEqual({
      MCP_WORKSPACE: join(projectDir, "workspace"),
      MCP_RUNTIME_ROOT: defaultRuntimeRoot,
    });
    expect(isAbsolute(environment?.MCP_WORKSPACE ?? "")).toBe(true);
  });

  it("refuses a custom path that does not exist, naming it, and writes no config", async () => {
    await expect(
      executeInstall(projectDir, { plugin: scope, mcp: "custom", mcpPath: "./missing-workspace" })
    ).rejects.toThrow("process.exit(1)");

    expect(logged.join("\n")).toContain("./missing-workspace");
    expect(logged.join("\n")).toContain(join(projectDir, "missing-workspace"));
    expect(existsSync(configPath(scope))).toBe(false);
  });
});

describe("install MCP workspace refusal", () => {
  it("refuses a custom path that is a file, not a directory", async () => {
    writeFileSync(join(projectDir, "not-a-dir"), "");

    await expect(
      executeInstall(projectDir, { plugin: "project", mcp: "custom", mcpPath: "not-a-dir" })
    ).rejects.toThrow("process.exit(1)");

    expect(logged.join("\n")).toContain("is not a directory");
    expect(existsSync(configPath("project"))).toBe(false);
  });
});
