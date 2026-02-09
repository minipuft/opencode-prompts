# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0](https://github.com/minipuft/opencode-prompts/compare/opencode-prompts-v1.4.5...opencode-prompts-v2.0.0) (2026-02-09)


### ⚠ BREAKING CHANGES

* Removed git submodule, now uses npm dependency

### Added

* add upstream sync workflow and project documentation ([02432e0](https://github.com/minipuft/opencode-prompts/commit/02432e0b8b1adb60c25e89e4eae3e5579372df2f))
* auto-register MCP server on plugin load ([fcaedf1](https://github.com/minipuft/opencode-prompts/commit/fcaedf1001a490af3ebec68c953381ea6ae5a274))
* auto-setup .claude/settings.json for oh-my-opencode ([15cff71](https://github.com/minipuft/opencode-prompts/commit/15cff719751c22b958e9e37ebb95b424b113447f))
* **ci:** add commitlint, changelog-sections, and daily dependabot ([4864490](https://github.com/minipuft/opencode-prompts/commit/4864490979e70557ac2c19b98692d00762e6a3f4))
* **cli:** add global plugin registration and interactive prompts ([e3eec2b](https://github.com/minipuft/opencode-prompts/commit/e3eec2b1ae8131398c66474490dd72c9751758e9))
* **cli:** add multi-step interactive install wizard ([c8e0cdf](https://github.com/minipuft/opencode-prompts/commit/c8e0cdf120c461fd5102dcf1624fb4ec58f2d942))
* **hooks:** add gate enforcement and skill catalog injection ([6be634c](https://github.com/minipuft/opencode-prompts/commit/6be634cc785337feb9a3ec12691f52efac7412e9))
* initial OpenCode plugin for claude-prompts MCP ([7222345](https://github.com/minipuft/opencode-prompts/commit/72223450e60ff215ba42d00f62e07918df50a2f2))
* migrate from submodule to npm dependency ([a5af2ed](https://github.com/minipuft/opencode-prompts/commit/a5af2edacd8594c2b57988eb71e4b0c570f862aa))


### Fixed

* **config:** respect global MCP configuration priority ([2c30ea8](https://github.com/minipuft/opencode-prompts/commit/2c30ea857b62859daf308b2747b42670f99fe1e0))
* **config:** route MCP config to same location as plugin registration ([2836b05](https://github.com/minipuft/opencode-prompts/commit/2836b057fc6557ea0d75ceab222e9439168f5926))
* **config:** use surgical JSON/JSONC modification to preserve comments ([06b03c7](https://github.com/minipuft/opencode-prompts/commit/06b03c73358b95ba62922af20a81ef2ca8bc4174))
* correct OpenCode MCP config schema and add root entry point ([0e1b746](https://github.com/minipuft/opencode-prompts/commit/0e1b74684bb3984d2cb85d16f925c13757e073af))
* **npm:** refine package distribution to exclude test artifacts ([ebbd41c](https://github.com/minipuft/opencode-prompts/commit/ebbd41c0a54fbbd05e438f000b89426dc1308c65))
* **plugin:** correct entry point for OpenCode plugin loader ([98cf4be](https://github.com/minipuft/opencode-prompts/commit/98cf4be4775366922e8a3a2cfe55bb0b5792aadc))
* **submodule:** point core to dist branch (956c113) for 1.3.2 ([09469b6](https://github.com/minipuft/opencode-prompts/commit/09469b65741ef4ea08e286dc62cb1866e2d6d9fa))


### Changed

* **hooks:** install to global ~/.claude/hooks/ instead of project settings ([5bccd73](https://github.com/minipuft/opencode-prompts/commit/5bccd73bf827a21501428cec7c663be3bf773812))
* **hooks:** remove skill catalog injection (handled by global hook) ([24f41dd](https://github.com/minipuft/opencode-prompts/commit/24f41dd81b08b9c71f4e69b0ec77224020c66cb9))
* rename MCP server key to opencode-prompts ([8c2e95c](https://github.com/minipuft/opencode-prompts/commit/8c2e95c2ada49692933627de365a5e69ae272994))
* **wizard:** single-keypress selection and remove node_modules option ([b630eeb](https://github.com/minipuft/opencode-prompts/commit/b630eeb038100d939c0deec2603a8a15938fc928))


### Documentation

* add gate enforcement and skill catalog to changelog [Unreleased] ([4c47017](https://github.com/minipuft/opencode-prompts/commit/4c47017bb795d8f92ca2d984e9a20827f10f35a9))
* add oh-my-opencode integration for full hook support ([7160719](https://github.com/minipuft/opencode-prompts/commit/71607190bf661d26aa074afb0e653702283a0e92))
* clarify oh-my-opencode installation and fallback behavior ([4b0c0e9](https://github.com/minipuft/opencode-prompts/commit/4b0c0e9baf34f15b45bdd2c48e16aad3172d082b))
* **readme:** document platform limitations and workarounds ([895e43c](https://github.com/minipuft/opencode-prompts/commit/895e43c5c1417467f4124227a59c7ef9ad249db2))
* streamline README with Diátaxis structure ([7219f52](https://github.com/minipuft/opencode-prompts/commit/7219f52e4299cbbb227ebecd2af530a6943a98f1))

## [Unreleased]

### Added

- **Gate enforcement** — `tool.execute.before` hook blocks FAIL gate verdicts and missing gate responses before prompt_engine execution

### Changed

- **Migrated from git submodule to npm dependency** - Now uses `claude-prompts` npm package instead of git submodule
  - Removed `core/` submodule directory
  - Removed `server` symlink
  - Added `claude-prompts` as npm dependency
  - Plugin hooks now reference `node_modules/claude-prompts/hooks/`
  - Simplified CI workflow (no submodule checkout needed)
  - Removed `update-submodule.yml` workflow (replaced by Dependabot)

### Fixed

- **Respect global MCP configuration** - Plugin no longer auto-creates project `opencode.json` that overrides user's global settings
  - Removed auto-config from plugin startup (was creating unwanted project configs)
  - `installMcpConfig()` now checks global config before creating project config
  - Made `readGlobalConfig()` lenient for JSONC parse errors (minor comment issues no longer break config reading)
  - Added `hasMcpConfigAnywhere()` to check both project and global config locations
  - Added `opencode.json` to `.gitignore` to prevent accidental commits of auto-generated configs
  - Updated tests to reflect new behavior (MCP config is optional in project, can come from global)

## [1.4.0] - 2025-01-17

### Added

- **CLI for npm publishing** - Install/uninstall hooks via `npx opencode-prompts install/uninstall`
- `src/cli/index.ts` - CLI entry point with help and version commands
- `src/cli/commands/install.ts` - Safe hook installation with merge support
- `src/cli/commands/uninstall.ts` - Safe hook removal preserving other hooks
- `src/lib/hooks-config.ts` - Shared hooks configuration module
- npm publish workflow (`.github/workflows/npm-publish.yml`)

### Changed

- Package now publishable to npm with `bin` and `files` configuration
- README updated with npm installation instructions
- CI workflow now includes build step

### Fixed

- Test expectations for MCP server name (`claude-prompts` not `opencode-prompts`)
- Test for core server checking config.json instead of package.json (dist branch)

## [1.2.0] - 2025-01-13

### Added

- Initial OpenCode plugin implementation
- Chain tracking via `tool.execute.after` hook
- Gate reminders with GATE_REVIEW guidance injection
- State preservation across session compaction
- Shell verification attempt tracking
- TypeScript library ports from Python hooks:
  - `workspace.ts` - Path resolution
  - `cache-manager.ts` - Prompt/gate cache operations
  - `session-state.ts` - Chain state management
- CI/CD workflows:
  - `ci.yml` - TypeScript checking and tests
  - `update-submodule.yml` - Auto-sync from core
  - `release-please.yml` - Automated releases
- E2E validation tests (31 tests)

### Architecture

- Submodule pattern matching gemini-prompts distribution
- Core MCP server at `/core` (claude-prompts-mcp)
- Server symlink for cache access
- In-memory session state with optional file persistence

[Unreleased]: https://github.com/minipuft/opencode-prompts/compare/v1.4.0...HEAD
[1.4.0]: https://github.com/minipuft/opencode-prompts/compare/v1.2.0...v1.4.0
[1.2.0]: https://github.com/minipuft/opencode-prompts/releases/tag/v1.2.0
