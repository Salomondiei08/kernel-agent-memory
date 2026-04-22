# Kernel: Unified Multi-Agent Memory & Token Tracking

Kernel solves multi-agent context fragmentation by providing a unified memory layer and local token tracking system. Agents (Claude Code, Codex, OpenCode) share project memory across sessions while maintaining visibility into token consumption per model, agent, and project.

## Features

- **Unified memory store** — file-based (MEMORY.md + project structure), optionally SQLite for scale
- **Cross-agent sync** — MCP-based read/write interface, no network calls
- **Local token tracking** — SessionEnd hook scans logs, estimates tokens via `js-tiktoken`
- **Web dashboard** (optional) — visualize token usage, memory size, cost trends
- **Modular installation** — barebones (memory only) or full (dashboard + SQLite)
- **Zero external APIs** — offline-first, runs entirely in project directory

## Installation

```bash
npm install
```

## Setup

```bash
npm run build
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

1. **MCP Server** — Exposes memory operations via standard MCP protocol
2. **Memory Store** — File-based MEMORY.md in project root, with dated archives
3. **Token Tracker** — SessionEnd hook scans and logs token usage to `.kernel/token-log.json`
4. **Web Dashboard** (optional) — Next.js app for visualization
5. **Hook System** — SessionStart/SessionEnd integration with Claude Code and other agents

## Required Environment Variables

None. Kernel runs entirely offline.

## Project Structure

```
.
├── src/                    # TypeScript source files
│   ├── cli.ts             # CLI entry point
│   ├── index.ts           # Main exports
│   └── mcp-server/        # MCP server implementation
├── dist/                  # Compiled JavaScript (generated)
├── .kernel/               # Kernel runtime directory (generated)
│   ├── kernel.json
│   ├── mcp-server/
│   ├── token-log.json
│   └── dashboard/         # (optional) Next.js app
├── package.json
├── tsconfig.json
└── README.md
```

## License

MIT
