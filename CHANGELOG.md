# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/minipuft/opencode-prompts/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/minipuft/opencode-prompts/releases/tag/v1.2.0
