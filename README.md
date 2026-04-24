<p align="center">
  <img src="docs/assets/kernel-logo.png" alt="Kernel Agent Memory" width="180" />
</p>

<h1 align="center">Kernel Agent Memory</h1>

<p align="center">
  Shared project memory for Claude Code, Codex, and OpenCode.
</p>

Kernel gives Claude Code, Codex, and OpenCode a small shared memory layer for a project. It installs session hooks that read recent context at startup and write high-signal session notes plus estimated token usage at shutdown.

Kernel is intentionally small: no server, no database, no background daemon, and no runtime dependencies. Each project gets a local `.kernel/MEMORY.md` file that agents can share through their native hook systems.

## Stack

| Layer | Technology | Why it is here |
| --- | --- | --- |
| Runtime | Node.js | Portable CLI and hook execution across local agent tools |
| Language | TypeScript | Strict, typed source for maintainable hook parsing |
| CLI | `kernel` bin | One command to initialize project memory and register hooks |
| Storage | Markdown + JSONL | Human-readable memory and append-only local token estimates |
| Hooks | Claude Code, Codex, OpenCode | Native startup/shutdown integration without a daemon |
| Testing | Vitest | Fast unit tests for scanners, hook input parsing, memory, and registry behavior |
| Local Models | Ollama | Token-free Claude Code/OpenCode experiments with local models such as Gemma |
| Packaging | npm | Public distribution through `kernel-agent-memory` |
| Hosting | GitHub | Public source, issues, and release history |

## Features

- **Shared memory store** — human-readable `.kernel/MEMORY.md`
- **SessionStart context** — prints the five most recent memories for agent context injection
- **SessionEnd capture** — extracts decision, implementation, fix, architecture, avoid, and code-snippet lines
- **Local token tracking** — appends estimated usage to `.kernel/token-log.json`
- **Agent hook registration** — updates Claude Code, Codex, and OpenCode hook surfaces while preserving existing settings
- **Zero runtime dependencies** — offline-first and project-local

## Status

- Codex hook registration has been verified with a real Codex CLI smoke test.
- Codex session capture works even when the hook payload does not include a transcript path; Kernel discovers the matching `~/.codex/sessions/**/*.jsonl` file by session id or project cwd.
- Claude Code and OpenCode startup injection has been verified through their generated Kernel hooks.
- Live Claude Code and OpenCode conversation tests depend on those CLIs and the selected model provider being available locally. For token-free Claude Code testing, use Ollama as shown below.

## Installation

```bash
npm install kernel-agent-memory
```

## Setup

Build the CLI:

```bash
npm run build
```

Install hooks for the current user and create `.kernel/MEMORY.md` in the current project:

```bash
npm link
kernel init
```

After publishing, users can run it without cloning:

```bash
npx kernel-agent-memory init
```

## Quick Smoke Test

Create a scratch project, install hooks, run Codex once, then inspect the shared memory file:

```bash
mkdir /tmp/kernel-smoke
cd /tmp/kernel-smoke
npx kernel-agent-memory init
codex exec --skip-git-repo-check -C "$PWD" \
  "Reply exactly: Decided: kernel smoke test memory works."
cat .kernel/MEMORY.md
```

You should see a `codex` memory entry containing the `Decided:` line.

## Using Claude Code Without Anthropic Tokens

If you have Claude Code installed but want to route it through a local Ollama model, launch it through Ollama's Claude Code integration:

```bash
ollama launch claude --model gemma4:e4b --yes -- \
  -p "Reply with the Kernel project context you received. Do not inspect files."
```

OpenCode can be launched through Ollama in the same style:

```bash
ollama launch opencode --model gemma4:e4b
```

## Development

Watch TypeScript files for changes:

```bash
npm run dev
```

## Testing

```bash
npm test
```

## Type Checking

Verify TypeScript without emitting files:

```bash
npm run typecheck
```

## Architecture

Kernel consists of:

1. **CLI** — `kernel init` creates project memory and registers hooks.
2. **Memory Store** — `.kernel/MEMORY.md` stores timestamped entries by agent.
3. **Session Scanner** — deterministic regex heuristics extract useful snippets from transcripts.
4. **Token Log** — `.kernel/token-log.json` stores newline-delimited usage estimates.
5. **Hook System** — SessionStart/SessionEnd integration with Claude Code, Codex, and OpenCode.

## Required Environment Variables

None. Kernel runs entirely offline.

Optional variables used by hooks:

- `KERNEL_PROJECT_ROOT` — project directory to read/write; defaults to `process.cwd()`
- `AGENT_TYPE` — agent label stored with memory and token entries
- `KERNEL_MODEL`, `CLAUDE_MODEL`, or `OPENAI_MODEL` — model label for token entries

## Agent Support

- **Claude Code**: installs `SessionStart` and `SessionEnd` command hooks in `~/.claude/settings.json`. Claude passes JSON on stdin with `cwd` and `transcript_path`; Kernel parses that transcript and injects SessionStart stdout as context.
- **Codex**: installs `SessionStart` and `Stop` command hooks in `~/.codex/hooks.json`, and enables `features.codex_hooks = true` in `~/.codex/config.toml`. Kernel also discovers Codex JSONL transcripts from `~/.codex/sessions` when Codex does not pass a transcript path directly.
- **OpenCode**: installs a global plugin at `~/.config/opencode/plugins/kernel-memory.js`. OpenCode does not expose the same transcript path as Claude/Codex, so this support is best-effort until explicit memory tooling is added.

## Project Structure

```
.
├── src/                    # TypeScript source files
│   ├── cli.ts             # CLI entry point
│   ├── agent-registry.ts  # Agent config hook registration
│   ├── memory.ts          # File-based memory store
│   ├── session-scanner.ts # Transcript snippet extraction
│   ├── token-log.ts       # Local token usage log
│   └── hooks/             # SessionStart and SessionEnd commands
├── dist/                  # Compiled JavaScript (generated)
├── .kernel/               # Kernel runtime directory (generated)
│   ├── MEMORY.md
│   ├── token-log.json
├── package.json
├── tsconfig.json
├── VERSION.md
└── README.md
```

## Roadmap

- MCP memory tools for explicit agent reads/writes
- Dashboard for token and memory trends
- Richer OpenCode transcript capture
- SQLite backend and cross-project memory index

## License

MIT
