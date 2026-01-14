# opencode-prompts

OpenCode plugin that tracks chain progress and reminds you about pending gates.

Stop losing chain state when OpenCode compacts your session. This plugin monitors `prompt_engine` calls and preserves your workflow context automatically.

## Quick Start

```bash
# Clone to your OpenCode plugin directory
cd ~/.config/opencode/plugin
git clone --recursive https://github.com/minipuft/opencode-prompts.git

# Or project-specific
mkdir -p .opencode/plugin && cd .opencode/plugin
git clone --recursive https://github.com/minipuft/opencode-prompts.git
```

That's it. OpenCode loads plugins automatically on startup.

![Demo: Chain state preserved across compaction](docs/demo-placeholder.gif)

## What It Does

| Hook | Effect |
|------|--------|
| `tool.execute.after` | Detects chain steps and gates from `prompt_engine` responses |
| `experimental.session.compacting` | Injects active chain state into compaction context |
| `session.deleted` | Cleans up session state |

**Example output after a prompt_engine call:**
```
[Chain] Step 2/4 - call prompt_engine to continue
[Gate] code-quality
  Respond: GATE_REVIEW: PASS|FAIL - <reason>
```

## Features

- **Chain Tracking** — Monitors step progress (Step 2/4)
- **Gate Reminders** — Injects GATE_REVIEW guidance when gates are pending
- **State Preservation** — Survives session compaction
- **Shell Verification** — Tracks verification loop attempts

## Configuration

The plugin configures the MCP server via `opencode.json`:

```json
{
  "mcp": {
    "opencode-prompts": {
      "command": "node",
      "args": ["${projectDir}/server/dist/index.js", "--transport=stdio"],
      "env": {
        "MCP_WORKSPACE": "${projectDir}"
      }
    }
  }
}
```

## Development

```bash
npm install          # Install dependencies
npm run typecheck    # Validate types
npm test             # Run 31 tests
```

## Architecture

```
opencode-prompts/
├── .opencode/plugin/index.ts   # Plugin entry (exports OpenCodePromptsPlugin)
├── src/lib/
│   ├── cache-manager.ts        # Reads prompts.cache.json
│   ├── session-state.ts        # In-memory state + parsing
│   └── workspace.ts            # Path resolution
├── core/                       # Submodule → claude-prompts-mcp
└── server -> core/server       # Symlink for cache access
```

## Related

- [claude-prompts-mcp](https://github.com/minipuft/claude-prompts-mcp) — Core MCP server
- [gemini-prompts](https://github.com/minipuft/gemini-prompts) — Gemini CLI extension
- [OpenCode Plugins Docs](https://opencode.ai/docs/plugins/)

## License

MIT
