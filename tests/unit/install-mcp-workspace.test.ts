/**
 * Install writes an MCP entry claude-prompts can start on (plan row 2.12).
 *
 * claude-prompts refuses a MCP_WORKSPACE that does not exist, and resolves a
 * relative one against the directory OpenCode starts it in. So the bundled
 * default writes no MCP_WORKSPACE, a custom path is stored absolute, and a
 * missing custom path is refused before any config is written.
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
import { isAbsolute, join } from "node:path";
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

type Scope = "project" | "global";
type ExecuteInstall = (projectDir: string, config: InstallConfig) => Promise<void>;

const home = mkdtempSync(join(tmpdir(), "opencode-prompts-home-"));
const globalConfigDir = join(home, ".config", "opencode");
let executeInstall: ExecuteInstall;
let projectDir: string;
let logged: string[];

function configPath(scope: Scope): string {
  return scope === "global"
    ? join(globalConfigDir, "opencode.json")
    : join(projectDir, "opencode.json");
}

function readMcpEntry(scope: Scope): { command?: string[]; environment?: Record<string, string> } {
  const config = JSON.parse(readFileSync(configPath(scope), "utf-8"));
  return config.mcp["opencode-prompts"];
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
  rmSync(projectDir, { recursive: true, force: true });
});

describe.each<Scope>(["project", "global"])("install MCP workspace (%s scope)", (scope) => {
  it("writes no MCP_WORKSPACE for the bundled default", async () => {
    await executeInstall(projectDir, { plugin: scope, mcp: "default" });

    const entry = readMcpEntry(scope);
    expect(entry.command).toEqual(MCP_COMMAND);
    expect(entry.environment?.MCP_WORKSPACE).toBeUndefined();
  });

  it("removes the old relative default from an existing config on re-install", async () => {
    const path = configPath(scope);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(
      path,
      JSON.stringify(
        {
          $schema: "https://opencode.ai/config.json",
          plugin: ["opencode-prompts"],
          model: "keep-me",
          mcp: {
            "opencode-prompts": {
              type: "local",
              command: MCP_COMMAND,
              environment: { MCP_WORKSPACE: RELATIVE_DEFAULT },
            },
          },
        },
        null,
        2
      )
    );

    await executeInstall(projectDir, { plugin: scope, mcp: "default" });

    const text = readFileSync(path, "utf-8");
    expect(text).not.toContain(RELATIVE_DEFAULT);
    expect(readMcpEntry(scope).environment?.MCP_WORKSPACE).toBeUndefined();
    expect(JSON.parse(text).model).toBe("keep-me");
  });

  it("stores a custom relative path absolute, resolved against the install directory", async () => {
    mkdirSync(join(projectDir, "workspace"));

    await executeInstall(projectDir, { plugin: scope, mcp: "custom", mcpPath: "./workspace" });

    const stored = readMcpEntry(scope).environment?.MCP_WORKSPACE;
    expect(stored).toBe(join(projectDir, "workspace"));
    expect(isAbsolute(stored ?? "")).toBe(true);
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
