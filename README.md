# opencode-prompts

OpenCode plugin for the [claude-prompts](https://github.com/minipuft/claude-prompts-mcp) MCP server. Chain tracking, gate reminders, and state preservation—all working with OpenCode's native plugin API.

[![npm version](https://img.shields.io/npm/v/opencode-prompts.svg?style=flat-square)](https://www.npmjs.com/package/opencode-prompts)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](https://opensource.org/licenses/MIT)

## Why This Plugin

| Problem | Solution | Result |
|---------|----------|--------|
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
| Hook scripts | `~/.claude/hooks/claude-prompts/` | Python hooks for chain tracking, gate reminders, state preservation |
| Hook registration | `~/.claude/hooks/hooks.json` | Registers hooks with Claude Code |
| Plugin registration | `~/.config/opencode/opencode.json` | Adds `"opencode-prompts"` to global plugin array |

**Examples:**

```bash
opencode-prompts install              # Interactive install
opencode-prompts install -y           # Non-interactive (CI/scripts)
opencode-prompts install --force      # Reinstall hooks
opencode-prompts install --skip-hooks # Plugin registration only
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
| Hook scripts | `~/.claude/hooks/claude-prompts/` |
| Hook registration | `~/.claude/hooks/hooks.json` |
| Plugin registration | `~/.config/opencode/opencode.json` |

**Examples:**

```bash
opencode-prompts uninstall                   # Full uninstall
opencode-prompts uninstall --cleanup-legacy  # Also clean project hooks
```

## Features

- **Chain Tracking** — Shows `Step 2/4` progress after each prompt_engine call
- **Gate Reminders** — Injects `GATE_REVIEW: PASS|FAIL` format when gates are pending
- **State Preservation** — Chain/gate state survives session compaction
- **Shell Verify Tracking** — Monitors verification loop attempts
- **Auto-cleanup** — Clears state when sessions end
- **Bundled MCP Server** — Includes claude-prompts server, no separate install needed

## Hooks

| OpenCode Hook | Purpose |
|---------------|---------|
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
| Chain tracking | Yes | Yes |
| Gate reminders | Yes | Yes |
| State preservation | Yes | Yes |
| `>>prompt` detection | No | Yes |
| Argument suggestions | No | Yes |

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
| `~/.claude/hooks/hooks.json` | Global | Hook registration |
| `~/.claude/hooks/claude-prompts/` | Global | Hook scripts |
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

The `claude-prompts` package is managed via npm (Dependabot auto-updates):

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
