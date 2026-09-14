# opencode-prompts

OpenCode plugin for the [claude-prompts](https://github.com/minipuft/claude-prompts-mcp) MCP server. Chain tracking, gate reminders, and state preservation—all working with OpenCode's native plugin API.

[![npm version](https://img.shields.io/npm/v/opencode-prompts.svg?style=flat-square)](https://www.npmjs.com/package/opencode-prompts)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](https://opensource.org/licenses/MIT)

## Why This Plugin

| Problem | Solution | Result |
|---------|----------|--------|
| FAIL verdict executed anyway | `tool.execute.before` blocks prompt_engine | Gate enforcement before execution |
| Chain state lost on `/compact` | State preservation hook | Resume from Step 3/5, not Step 1 |
| Forgot to respond to gate review | Gate reminder injection | `GATE_REVIEW: PASS\|FAIL` prompt appears |

| Verify loop runs forever | Shell verify tracking | Loop terminates after max attempts |
| MCP server setup is manual | Bundled claude-prompts server | Works out of the box |

## Quick Start

```bash
# Install globally
npm install -g opencode-prompts
opencode-prompts install

# Or via npx (non-interactive)
npx opencode-prompts install -y
```

Restart OpenCode. You should see chain progress after prompt_engine calls:

```text
[Chain] Step 2/4 - call prompt_engine to continue
[Gate] code-quality
  Respond: GATE_REVIEW: PASS|FAIL - <reason>
```

## CLI Reference

### `install`

Sets up hooks and registers the plugin globally.

```bash
opencode-prompts install [options]
```

**Existing users: re-run `opencode-prompts install`.** Older versions wrote `MCP_WORKSPACE=./node_modules/claude-prompts`, which names nothing in most projects, and claude-prompts refuses to start on a workspace that does not exist. Re-running install removes that value, including a legacy `mcp["claude-prompts"]` entry that still has the old shape.

**Options:**

| Flag | Description |
|------|-------------|
| `--yes`, `-y` | Skip prompts, auto-confirm all questions |
| `--force` | Reinstall hooks even if already installed |
| `--skip-hooks` | Only register plugin, skip hook installation |
| `--help`, `-h` | Show help message |

**What it configures:**

| Component | Location | Description |
|-----------|----------|-------------|
| Plugin registration | `~/.config/opencode/opencode.json` | Adds `"opencode-prompts"` to global plugin array |
| MCP server | `~/.config/opencode/opencode.json` | Registers the bundled claude-prompts server with no `MCP_WORKSPACE`, so it uses its own package root; a custom workspace must be an existing directory and is stored as an absolute path. `MCP_RUNTIME_ROOT` is set to `$XDG_DATA_HOME/opencode-prompts`, else `~/.local/share/opencode-prompts`, so runtime state survives clearing the npx cache |

Gate enforcement, chain tracking, and state preservation run through OpenCode's native plugin API — no hook files are installed.

**Examples:**

```bash
opencode-prompts install              # Interactive install
opencode-prompts install -y           # Non-interactive (CI/scripts)
opencode-prompts install --force      # Reinstall plugin registration
opencode-prompts install --skip-hooks # Plugin registration only (deprecated flag, no-op)
```

### `uninstall`

Removes hooks and plugin registration.

```bash
opencode-prompts uninstall [options]
```

**Options:**

| Flag | Description |
|------|-------------|
| `--cleanup-legacy` | Also remove hooks from project `.claude/settings.json` |
| `--help`, `-h` | Show help message |

**What it removes:**

| Component | Location |
|-----------|----------|
| Plugin registration | `~/.config/opencode/opencode.json` |
| Legacy hook scripts | `~/.claude/hooks/claude-prompts/` (from older versions) |
| Legacy hook registration | `~/.claude/hooks/hooks.json` (from older versions) |

**Examples:**

```bash
opencode-prompts uninstall                   # Full uninstall
opencode-prompts uninstall --cleanup-legacy  # Also clean project hooks
```

## Features

- **Gate Enforcement** — Blocks FAIL verdicts and missing gate responses before execution
- **Exported-Skill Gates** — Reading an exported skill that ships `gates/index.json` arms its gates; every further tool call is blocked until `GATE_REVIEW: PASS|FAIL` clears them
- **Chain Tracking** — Shows `Step 2/4` progress after each prompt_engine call
- **Gate Reminders** — Injects `GATE_REVIEW: PASS|FAIL` format when gates are pending

- **State Preservation** — Chain/gate/armed-gate state survives session compaction AND plugin restarts (persisted to disk)
- **Shell Verify Tracking** — Monitors verification loop attempts
- **Auto-cleanup** — Clears state when sessions end
- **Bundled MCP Server** — Includes claude-prompts server, no separate install needed

### Exported-Skill Gate Enforcement

The upstream exporter writes a `gates/index.json` manifest beside every gated skill's `SKILL.md`. When you read such a skill, the plugin arms its gates for the session:

```text
[read] ~/.config/opencode/skills/strategicImplement/SKILL.md
→ gates armed: workflow-preflight, plan-quality, ... (12)

[bash] blocked: "Exported-skill gates armed from ... require review.
Respond with GATE_REVIEW: PASS|FAIL - <reason> before running further tools."
```

A `PASS` verdict disarms the gate (durably); `FAIL` keeps it armed with an escalation message. Resolution verbs (`gate_action`, `cancel`) are loaded from the bundled claude-prompts contract so legitimate gate exits are never trapped.

## Hooks

| OpenCode Hook | Purpose |
|---------------|---------|
| `tool.execute.before` | Blocks FAIL gate verdicts and missing gate responses |
| `tool.execute.after` | Injects chain progress + gate reminders |

| `experimental.session.compacting` | Preserves active chain/gate state |
| `session.deleted` | Cleans up state files |

## Full Prompt Syntax (Optional)

OpenCode lacks a `UserPromptSubmit` hook, so `>>prompt` syntax detection requires [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode):

```bash
npx oh-my-opencode install
```

This plugin auto-configures hooks when oh-my-opencode is detected. Without it, use explicit MCP calls:

```text
Use prompt_engine to run the diagnose prompt with scope:"auth"
```

| Feature | Native OpenCode | + oh-my-opencode |
|---------|-----------------|------------------|
| Gate enforcement | Yes | Yes |
| Chain tracking | Yes | Yes |
| Gate reminders | Yes | Yes |
| State preservation | Yes | Yes |
| `>>prompt` detection | No | Yes |
| Argument suggestions | No | Yes |

## Known Gaps

| Claude Code Hook | OpenCode Status | Impact |
|-----------------|-----------------|--------|
| `UserPromptSubmit` | No equivalent event | `>>prompt` syntax requires oh-my-opencode or explicit MCP calls |
| `SubagentStop` | No equivalent event | Delegated sub-agents can complete without satisfying gate criteria |

Both gaps are upstream OpenCode limitations. When equivalent events are added, port the corresponding Claude Code hooks.

## Configuration

The installer registers the plugin globally in `~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["opencode-prompts"]
}
```

### MCP Server Configuration

MCP configuration can be set globally or per-project. **Global config is recommended** for consistent behavior across projects:

```json
{
  "mcp": {
    "opencode-prompts": {
      "type": "local",
      "command": ["npx", "claude-prompts", "--transport=stdio"],
      "environment": {
        "MCP_WORKSPACE": "/path/to/your/workspace"
      }
    }
  }
}
```

**Priority order** (OpenCode merges configs, higher priority wins):
1. Project config (`./opencode.json`) — highest priority
2. Global config (`~/.config/opencode/opencode.json`)

> **Note:** The plugin respects your global MCP settings and will not auto-create project configs that would override them.

### Configuration Locations

| File | Scope | Purpose |
|------|-------|---------|
| `~/.config/opencode/opencode.json` | Global | Plugin + MCP registration (recommended) |
| `.opencode/plugin/index.ts` | Package | Enforcement via OpenCode plugin API (gate blocks, chain tracking, state preservation) |
| `./opencode.json` | Project | Project-specific overrides (optional) |

## Development

```bash
git clone https://github.com/minipuft/opencode-prompts
cd opencode-prompts
npm install
npm run build
npm test
```

### Local Testing

To test local changes with OpenCode, link to the bun cache:

```bash
# Remove npm-installed version and link local
rm -rf ~/.cache/opencode/node_modules/opencode-prompts
ln -s $(pwd) ~/.cache/opencode/node_modules/opencode-prompts

# Restart OpenCode to load local version
```

### Updating Core Dependency

The `claude-prompts` package is synchronized by the upstream release workflow.
Renovate manages other dependency updates using the shared repository standards.
For local testing, update the package and lockfile together:

```bash
npm update claude-prompts
```

## Related Projects

| Project | Description |
|---------|-------------|
| [claude-prompts-mcp](https://github.com/minipuft/claude-prompts-mcp) | Core MCP server with chains, gates, frameworks |
| [gemini-prompts](https://github.com/minipuft/gemini-prompts) | Gemini CLI extension (full hook support) |
| [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode) | Claude Code compatibility layer for OpenCode |
| [minipuft-plugins](https://github.com/minipuft/minipuft-plugins) | Claude Code plugin marketplace |

## License

MIT
