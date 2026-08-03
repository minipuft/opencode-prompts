#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Measured from the 1.4.5 production build on 2026-08-02:
// 45,378 packed and 231,484 unpacked bytes.
const packedSizeBudget = 75_000;
const unpackedSizeBudget = 350_000;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: packageRoot,
    encoding: "utf8",
    stdio: "pipe",
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.status})\n${result.stdout}${result.stderr}`,
    );
  }
  return result.stdout.trim();
}

function inventoryViolations(manifest, pack) {
  const violations = [];
  const files = new Set(pack.files.map(({ path }) => path.replace(/^package\//, "")));
  if (pack.version !== manifest.version) {
    violations.push(`tarball version ${pack.version} does not match ${manifest.version}`);
  }
  for (const [name, target] of Object.entries(manifest.bin ?? {})) {
    if (!files.has(target.replace(/^\.\//, ""))) {
      violations.push(`bin ${name} target is absent: ${target}`);
    }
  }
  if (!manifest.bin?.["opencode-prompts"]) {
    violations.push("required opencode-prompts bin is not declared");
  }
  for (const [name, target] of Object.entries(manifest.exports ?? {})) {
    if (typeof target !== "string" || !files.has(target.replace(/^\.\//, ""))) {
      violations.push(`export ${name} target is absent: ${target}`);
    }
  }
  if (pack.files.some(({ path }) => /(?:^|\/)tests?(?:\/|$)/.test(path))) {
    violations.push("test files are present in the tarball");
  }
  if (pack.size > packedSizeBudget) {
    violations.push(`packed size ${pack.size} exceeds ${packedSizeBudget}`);
  }
  if (pack.unpackedSize > unpackedSizeBudget) {
    violations.push(`unpacked size ${pack.unpackedSize} exceeds ${unpackedSizeBudget}`);
  }
  return violations;
}

function runtimeViolations(expectedVersion, installedVersion, output) {
  const violations = [];
  if (installedVersion !== expectedVersion) {
    violations.push(`installed version ${installedVersion} does not match ${expectedVersion}`);
  }
  if (output.version !== expectedVersion) {
    violations.push(`--version returned ${output.version}, expected ${expectedVersion}`);
  }
  if (!output.help.includes("Usage: opencode-prompts")) {
    violations.push("--help did not return the expected usage surface");
  }
  if (!output.rootExport.endsWith("/dist/.opencode/plugin/index.js")) {
    violations.push(`root export resolved unexpectedly: ${output.rootExport}`);
  }
  if (!output.cliExport.endsWith("/dist/src/cli/index.js")) {
    violations.push(`CLI export resolved unexpectedly: ${output.cliExport}`);
  }
  return violations;
}

function selfTest() {
  const manifest = {
    version: "1.4.5",
    bin: { "opencode-prompts": "./dist/src/cli/index.js" },
    exports: {
      ".": "./dist/.opencode/plugin/index.js",
      "./cli": "./dist/src/cli/index.js",
    },
  };
  const healthy = {
    version: manifest.version,
    size: 45_000,
    unpackedSize: 230_000,
    files: [
      { path: "dist/src/cli/index.js" },
      { path: "dist/.opencode/plugin/index.js" },
    ],
  };
  const cases = [
    ["missing bin", { ...healthy, files: healthy.files.slice(1) }],
    ["wrong version", { ...healthy, version: "0.0.0" }],
    ["packed budget", { ...healthy, size: packedSizeBudget + 1 }],
    ["unpacked budget", { ...healthy, unpackedSize: unpackedSizeBudget + 1 }],
    ["test files", { ...healthy, files: [...healthy.files, { path: "tests/e2e.js" }] }],
  ];
  for (const [name, pack] of cases) {
    if (inventoryViolations(manifest, pack).length === 0) throw new Error(`${name} passed`);
  }
  const badRuntime = runtimeViolations(manifest.version, "0.0.0", {
    version: "0.0.0",
    help: "missing",
    rootExport: "file:///wrong.js",
    cliExport: "file:///wrong.js",
  });
  if (badRuntime.length !== 5) throw new Error("runtime negative fixture passed");
  if (inventoryViolations(manifest, healthy).length) throw new Error("healthy inventory failed");
  console.log("PASSED: package artifact policy fixtures");
}

function main() {
  if (process.argv.includes("--self-test")) return selfTest();
  const outputIndex = process.argv.indexOf("--pack-destination");
  const requestedOutput = outputIndex === -1 ? undefined : process.argv[outputIndex + 1];
  if (outputIndex !== -1 && !requestedOutput) {
    throw new Error("--pack-destination requires a path");
  }

  const scratch = mkdtempSync(join(tmpdir(), "opencode-prompts-package-"));
  const packDestination = requestedOutput ? resolve(requestedOutput) : scratch;
  const consumer = join(scratch, "consumer");
  try {
    mkdirSync(packDestination, { recursive: true });
    mkdirSync(consumer, { recursive: true });
    const [pack] = JSON.parse(
      run("npm", ["pack", "--json", "--pack-destination", packDestination]),
    );
    const tarball = join(packDestination, basename(pack.filename));
    if (!existsSync(tarball)) throw new Error(`npm pack did not create ${tarball}`);

    const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
    const inventory = inventoryViolations(manifest, pack);
    if (inventory.length) throw new Error(inventory.join("\n"));

    run("npm", ["init", "--yes"], { cwd: consumer });
    run(
      "npm",
      ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false", tarball],
      { cwd: consumer },
    );
    const installedRoot = join(consumer, "node_modules", manifest.name);
    const installed = JSON.parse(readFileSync(join(installedRoot, "package.json"), "utf8"));
    const bin = join(installedRoot, installed.bin["opencode-prompts"]);
    const output = {
      version: run(process.execPath, [bin, "--version"], { cwd: consumer }),
      help: run(process.execPath, [bin, "--help"], { cwd: consumer }),
      rootExport: run(process.execPath, ["--input-type=module", "-e", "console.log(import.meta.resolve('opencode-prompts'))"], { cwd: consumer }),
      cliExport: run(process.execPath, ["--input-type=module", "-e", "console.log(import.meta.resolve('opencode-prompts/cli'))"], { cwd: consumer }),
    };
    const runtime = runtimeViolations(manifest.version, installed.version, output);
    if (runtime.length) throw new Error(runtime.join("\n"));
    console.log(
      `Verified ${pack.filename}: ${pack.size} packed, ${pack.unpackedSize} unpacked, ${pack.entryCount} files`,
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

main();
