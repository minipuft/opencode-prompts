# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
