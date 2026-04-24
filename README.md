# Kernel: Shared Agent Memory

Kernel gives Claude Code, Codex, and OpenCode a small shared memory layer for a project. It installs session hooks that read recent context at startup and write high-signal session notes plus estimated token usage at shutdown.

## Features

- **Shared memory store** — human-readable `.kernel/MEMORY.md`
- **SessionStart context** — prints the five most recent memories for agent context injection
- **SessionEnd capture** — extracts decision, implementation, fix, architecture, avoid, and code-snippet lines
- **Local token tracking** — appends estimated usage to `.kernel/token-log.json`
- **Agent hook registration** — updates Claude Code, Codex, and OpenCode config files while preserving existing settings
- **Zero runtime dependencies** — offline-first and project-local

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
- SQLite backend and cross-project memory index

## License

MIT
