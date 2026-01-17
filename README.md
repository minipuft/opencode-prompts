# opencode-prompts

OpenCode plugin for the [claude-prompts](https://github.com/minipuft/claude-prompts-mcp) MCP server. Tracks chain progress, reminds you about pending gates, and preserves workflow state across session compaction.

## Why This Matters

| Problem | Solution | Result |
|---------|----------|--------|
| Chain state lost on `/compact` | State preservation hook | Resume from Step 3/5, not Step 1 |
| Forgot to respond to gate review | Gate reminder injection | `GATE_REVIEW: PASS\|FAIL` prompt appears |
| Verify loop runs forever | Shell verify tracking | Loop terminates after max attempts |

## Quick Start

```bash
# Clone to OpenCode plugin directory
cd ~/.config/opencode/plugin
git clone --recursive https://github.com/minipuft/opencode-prompts.git

# Or project-local
mkdir -p .opencode/plugin && cd .opencode/plugin
git clone --recursive https://github.com/minipuft/opencode-prompts.git
```

OpenCode loads plugins automatically. Restart your session to activate.

---

## What Works

| Hook | Triggers | Effect |
|------|----------|--------|
| `tool.execute.after` | After `prompt_engine` call | Injects chain progress + gate reminders |
| `experimental.session.compacting` | Before `/compact` | Preserves active chain/gate state |
| `session.deleted` | Session ends | Cleans up state files |

**Example output after a prompt_engine call:**

```
[Chain] Step 2/4 - call prompt_engine to continue
[Gate] code-quality
  Respond: GATE_REVIEW: PASS|FAIL - <reason>
  Check: Tests pass | No type errors | Coverage >80%
```

---

## Platform Limitation: No Prompt Syntax Detection

⚠️ **OpenCode lacks a `UserPromptSubmit` hook** (the equivalent of Claude Code's pre-message interception).

### What This Means

On Claude Code and Gemini CLI, typing `>>diagnose` triggers a hook that:
1. Detects the `>>prompt` syntax
2. Looks up available arguments
3. Injects context so the model knows how to call `prompt_engine`

**OpenCode doesn't support this.** The model won't automatically recognize `>>diagnose` as a prompt command.

### Workarounds

**Option 1: Explicit MCP calls** (Recommended)

Instead of `>>diagnose`, tell the model directly:

```
Use prompt_engine to run the diagnose prompt with scope:"auth" and focus:"security"
```

**Option 2: System prompt guidance**

Add to your project's `.opencode/AGENTS.md` or system instructions:

```markdown
## Prompt Engine

This project uses the claude-prompts MCP server. Available prompts:
- `diagnose` - Analyze issues (args: scope, focus, symptoms)
- `review` - Code review (args: files, depth)

When I mention ">>promptname", call prompt_engine(command:">>promptname", options:{...})
```

**Option 3: Query the MCP server**

The model can discover prompts dynamically:

```
List available prompts from the claude-prompts MCP server, then run diagnose
```

### Option 4: oh-my-opencode Integration (Full Feature Parity)

[oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode) provides Claude Code hook compatibility, including `UserPromptSubmit`.

**Setup:**

1. Install oh-my-opencode:
   ```bash
   npm install -g oh-my-opencode
   ```

2. **That's it!** The plugin auto-creates `.claude/settings.json` on first load with the correct hooks.

**What happens automatically:**
- Plugin creates `.claude/settings.json` in your project (if missing)
- Hooks are configured to route through our `prompt-suggest.py`
- `>>prompt` syntax detection works immediately

**Note:** This uses project-local `.claude/settings.json`, not `~/.claude/`. Hooks stay within the plugin.

**Manual override:** If you need custom hook configuration, edit `.claude/settings.json` or copy `.claude/settings.json.example` as a starting point.

### Feature Request

If you want native `>>prompt` detection in OpenCode (without oh-my-opencode), request a `tui.prompt.submit` or `message.before` hook at [OpenCode GitHub](https://github.com/sst/opencode/issues).

---

## Features

- **Chain Tracking** — Shows `Step 2/4` progress after each prompt_engine call
- **Gate Reminders** — Injects `GATE_REVIEW: PASS|FAIL` format when gates are pending
- **State Preservation** — Chain/gate state survives session compaction
- **Shell Verify Tracking** — Monitors verification loop attempts
- **Auto-cleanup** — Clears state when sessions end

---

## Configuration

The plugin registers the MCP server via `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "claude-prompts": {
      "type": "local",
      "command": ["node", "server/dist/index.js", "--transport=stdio"],
      "environment": {
        "MCP_WORKSPACE": "."
      }
    }
  }
}
```

---

## Architecture

```
opencode-prompts/
├── .opencode/plugin/index.ts   # Plugin entry (TypeScript)
├── src/lib/
│   ├── cache-manager.ts        # Reads prompts.cache.json
│   ├── session-state.ts        # State tracking + parsing
│   └── workspace.ts            # Path resolution
├── core/                       # Submodule → claude-prompts-mcp dist
└── server -> core/server       # Symlink for cache access
```

### Hook Mapping

| OpenCode Hook | Claude Code Equivalent | Purpose | oh-my-opencode |
|---------------|------------------------|---------|-----------------|
| `tool.execute.after` | `PostToolUse` | Chain/gate tracking | ✅ |
| `experimental.session.compacting` | `PreCompact` | State preservation | ✅ |
| `session.created` | `SessionStart` | Initialization | ✅ |
| `session.deleted` | `Stop` | Cleanup | ✅ |
| ❌ Not available | `UserPromptSubmit` | Prompt syntax detection | ✅ Fills gap |

---

## Development

```bash
npm install          # Install dependencies
npm run typecheck    # Validate TypeScript
npm test             # Run tests
```

### Updating Core

The `core/` submodule tracks claude-prompts-mcp's `dist` branch:

```bash
git submodule update --remote --merge
```

---

## Comparison: OpenCode vs Claude Code vs Gemini

| Feature | Claude Code | Gemini CLI | OpenCode | OpenCode + oh-my-opencode |
|---------|-------------|------------|----------|---------------------------|
| Chain tracking | ✅ | ✅ | ✅ | ✅ |
| Gate reminders | ✅ | ✅ | ✅ | ✅ |
| State preservation | ✅ | ✅ | ✅ | ✅ |
| `>>prompt` detection | ✅ | ✅ | ❌ | ✅ |
| Argument suggestions | ✅ | ✅ | ❌ | ✅ |

---

## Related

- [claude-prompts-mcp](https://github.com/minipuft/claude-prompts-mcp) — Core MCP server
- [gemini-prompts](https://github.com/minipuft/gemini-prompts) — Gemini CLI extension (full hook support)
- [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode) — Claude Code compatibility layer for OpenCode
- [OpenCode Plugins Docs](https://opencode.ai/docs/plugins/)

---

## License

MIT
