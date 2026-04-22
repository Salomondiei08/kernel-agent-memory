# Kernel: Unified Multi-Agent Memory & Token Tracking

**Date:** 2026-04-22  
**Status:** Design Approved  
**Author:** Claude Code

---

## Executive Summary

Kernel solves multi-agent context fragmentation by providing a unified memory layer and local token tracking system. Agents (Claude Code, Codex, OpenCode) share project memory across sessions while maintaining visibility into token consumption per model, agent, and project.

Core features:
- **Unified memory store** — file-based (MEMORY.md + project structure), optionally SQLite for scale
- **Cross-agent sync** — MCP-based read/write interface, no network calls
- **Local token tracking** — SessionEnd hook scans logs, estimates tokens via `js-tiktoken`
- **Web dashboard** (optional) — visualize token usage, memory size, cost trends
- **Modular installation** — barebones (memory only) or full (dashboard + SQLite)
- **Zero external APIs** — offline-first, runs entirely in project directory

---

## Problem Statement

**Agents lose context across sessions:**
- Claude Code session ends → Codex starts in same project → no shared context
- Token limits force session restarts → previous work invisible
- No visibility into token spending → can't optimize

**Existing solutions incomplete:**
- Memorix handles memory but not token tracking
- Tokscale tracks tokens but not multi-agent memory
- langchain is library-level, not agent-orchestration

Kernel bridges both: shared memory + token visibility for agent orchestration.

---

## Architecture

### Core Components

**MCP Server** (`~/.kernel/mcp-server`)
- Runs locally, exposes memory operations via standard MCP
- Agents connect via standard MCP client library
- Operations: `memory.read(key)`, `memory.search(query)`, `memory.add(key, value, metadata)`
- No authentication, file-system scoped

**Memory Store**
- Default: file-based (MEMORY.md in project root + agent-specific files in `.claude/projects/*/memory/`)
- Switchable: SQLite backend for projects exceeding ~10MB in memory size
- Conflict resolution: last-write-wins with agent ID + timestamp logged

**Token Tracker**
- SessionEnd hook triggers scan of session files
- Parses tokens using `js-tiktoken`
- Fallback: character count + model pricing table if tiktoken fails
- Stores: `{ date, model, tokens, agent, project }` in `.kernel/token-log.json`

**Web Dashboard** (optional, full mode only)
- Next.js app, serves from `.kernel/dashboard/`
- Reads `.kernel/token-log.json` and memory files directly
- Zero backend API — pure static file reads
- Shows: tokens by model/agent/project, memory size trends, cost projections

**Hook System**
- Registers SessionStart hooks in Claude Code / Codex / OpenCode settings
- SessionStart: injects top 3-5 memory results into prompt context
- SessionEnd: logs token consumption to `.kernel/token-log.json`

### File Layout

```
project-root/
├── .kernel/
│   ├── kernel.json              # mode, installed features, config
│   ├── mcp-server/              # MCP server code + package.json
│   ├── token-log.json           # cumulative token usage
│   ├── .lock                    # concurrent write lock
│   └── dashboard/               # (full mode) Next.js app
├── .claude/
│   └── projects/
│       └── <project>/
│           └── memory/
│               ├── MEMORY.md    # shared memory (all agents)
│               └── 2026-04-22.md # dated archive
├── docs/
│   └── superpowers/
│       └── specs/               # design docs
└── README.md
```

---

## Data Flow & Memory Operations

### Read Flow (Agent queries memory)

1. Agent calls `kernel.memory.search("authentication strategy")`
2. MCP server searches project memory files + cross-project index
3. Returns snippets ranked by recency (newest first) + keyword match score
4. Hook injects top 3-5 into SessionStart context
5. Agent can reference injected memory in prompt

### Write Flow (Agent adds memory)

1. Agent calls `kernel.memory.add("auth-jwt-pattern", "use RS256 with 1h expiry", { category: "security" })`
2. MCP server appends to project MEMORY.md with timestamp + agent ID
3. Entry format: `[agent-name | timestamp] category: content`
4. If file exceeds 5MB, rotate to dated archive (2026-04-22.md)
5. Rebalance: move old entries to cold storage as needed

### Cross-Agent Sync

- No network layer — agents read/write same local `.kernel/` files
- Agents query MCP for search; MCP reads files directly
- Conflict resolution: file-system level locking via `.lock` file
- Last-write-wins for concurrent edits (agent + timestamp logged for audit)

---

## Token Tracking & Reporting

### Token Collection

SessionEnd hook triggers:
1. Scans session files (Claude Code: `~/.claude/sessions/`, Codex: similar)
2. Tokenizes session content via `js-tiktoken`
3. Records: `{ timestamp, model, tokens, agent, project }`
4. Appends to `.kernel/token-log.json`

Fallback (if tiktoken fails):
- Character count / 4 (rough estimate)
- Use model pricing table from pricing.json (Claude 3.5 Sonnet, GPT-4, etc.)

### Dashboard (Full Mode)

Reads `.kernel/token-log.json` and memory files:
- **Tokens by Model** — stacked area chart over 30 days
- **Tokens by Agent** — bar chart (Claude Code vs Codex vs OpenCode)
- **Tokens by Project** — pie chart showing distribution
- **Memory Size Trends** — line chart of .kernel/ directory size
- **Cost Projections** — monthly burn rate at current pace
- **Top Memory Queries** — which memory lookups happen most

No backend API. File watcher monitors token-log.json; dashboard auto-refreshes.

---

## Installation & Configuration

### Barebones Mode (Memory Only)

```bash
npm install @kernel/mcp-server
kernel init --mode bare
```

Steps:
1. Creates `.kernel/mcp-server/` directory with MCP server code
2. Registers MCP config in Claude Code / Codex settings.json
3. Registers SessionStart/SessionEnd hooks
4. Creates `.kernel/kernel.json` with mode + defaults
5. Initializes MEMORY.md in project root
6. Ready to use — agents auto-discover via MCP

### Full Mode (Memory + Dashboard + SQLite)

```bash
npm install @kernel/mcp-server @kernel/dashboard
kernel init --mode full
```

Steps:
1. Includes barebones setup (above)
2. Scaffolds Next.js app in `.kernel/dashboard/`
3. Creates SQLite database at `.kernel/memory.db` (optional — uses file-based by default)
4. Registers file watcher for `.kernel/token-log.json`
5. Optional: `kernel serve` starts dashboard on `localhost:3001`

### Per-Agent Configuration

**Claude Code:**
- User adds MCP server config to `~/.claude/settings.json` via `kernel init`
- Hook automatically injects memory on SessionStart
- SessionEnd logs tokens

**Codex / OpenCode:**
- Same MCP interface, different hook locations
- Kernel auto-detects agent type from context
- No manual setup per agent — one `kernel init` covers all

### Switching Agents

Same project, different agent:
1. User opens project in Codex instead of Claude Code
2. Codex hook injects memory from `.kernel/MEMORY.md`
3. Codex writes memory + tokens to same `.kernel/` store
4. Dashboard shows unified tokens + memory across agents

---

## Integration with Agents

### Claude Code Integration

- Hook reads `~/.claude/projects/<project>/MEMORY.md` on SessionStart
- Extracts top 5 results matching session context
- Injects as "Project Context" section above user prompt
- SessionEnd: scans session file, counts tokens, logs to `.kernel/token-log.json`

### Codex / OpenCode Integration

- Same MCP interface as Claude Code
- Kernel detects agent type via environment or settings
- Reads memory from project-local `.kernel/MEMORY.md`
- Injects context same way, logs tokens same way

### Multi-Agent Workflow Example

1. Claude Code: `kernel.memory.add("auth-pattern", "JWT with RS256")`
2. Claude Code session ends (logs 45K tokens)
3. User switches to Codex same project
4. Codex SessionStart: kernel injects "auth-pattern" into context
5. Codex uses it, adds refinement: `kernel.memory.add("auth-pattern", "refresh-token strategy: use HTTPOnly cookie")`
6. Codex session ends (logs 32K tokens)
7. Dashboard shows: 77K tokens total, split between Claude Code (45K) and Codex (32K)

---

## Error Handling & Edge Cases

| Scenario | Behavior |
|----------|----------|
| Token estimation fails | Fallback to character count / 4 + pricing table |
| Memory file corrupted | Keep `.kernel/.bak` auto-backup; recover on next write |
| MCP server crashes | Agents fall back to direct file read (slower, survives) |
| Concurrent writes | File-system locking via `.lock` file; queued writes |
| Dashboard server crash | token-log.json still updates; dashboard shows stale data until restart |
| MEMORY.md exceeds 5MB | Auto-rotate to dated archive (2026-04-22.md); keep index |
| Agent not recognized | Default to generic "unknown-agent" tag; log warning |
| No tiktoken available | Use character-based estimation + fallback pricing |

---

## Testing Strategy

### Unit Tests
- Token estimation: mock `js-tiktoken`, verify estimation accuracy
- Memory search ranking: test recency + keyword scoring
- Hook payload generation: ensure SessionStart context is formatted correctly

### Integration Tests
- Hook injection → agent receives injected context
- SessionEnd → tokens logged to `token-log.json`
- MCP server → agents can read/write/search memory
- File rotation → MEMORY.md auto-archives when exceeding threshold

### End-to-End Tests
- Multi-agent flow: Claude Code writes memory, Codex reads + extends
- Token aggregation: verify tokens from both agents appear in dashboard
- Cross-project queries: memory doesn't leak between projects

### Performance Tests
- Token scanning on 100k+ line session file completes in <2s
- Memory search on 10MB+ memory.db returns results in <500ms
- Dashboard reload with 10k token entries in <1s

---

## Rollout & Adoption

### Phase 1: Core (Month 1)
- MCP server + memory store
- SessionStart/SessionEnd hooks
- Token logging to JSON

### Phase 2: Dashboard (Month 2)
- Web dashboard for token visualization
- Memory size trends
- Cost projections

### Phase 3: Scale (Month 3)
- SQLite backend option
- Cross-project memory index
- Encryption for sensitive memories

### Articles & Talks
- Conference talk: "Agent Amnesia: Teaching AI Tools to Share Memory"
- Blog: "Multi-Agent Context Management Without External APIs"
- Encourage others to build similar tools

---

## Success Criteria

- ✅ Agents share memory across sessions without re-introducing context
- ✅ Token consumption visible at project/agent/model level
- ✅ Installation & setup takes <5 minutes
- ✅ Zero external API calls (offline-first)
- ✅ Supports Claude Code, Codex, OpenCode without special setup per agent
- ✅ Dashboard updates in real-time as tokens are logged
- ✅ Memory survives agent crashes and session restarts

---

## Scope & Constraints

**In Scope:**
- File-based memory store (MEMORY.md)
- MCP server for memory operations
- Local token tracking via SessionEnd hook
- Web dashboard (optional)
- Support for 3+ agents (Claude Code, Codex, OpenCode)

**Out of Scope:**
- Network synchronization (agents on different machines)
- Encrypted memory (future phase)
- Integration with external APIs (intentionally offline-first)
- Agent behavior optimization (this is tracking, not control)

---

## Open Questions Resolved

1. **Multi-agent sync:** File-based with last-write-wins (simple, robust)
2. **Token tracking:** Local scan via `js-tiktoken` + fallback estimation
3. **UI:** Web dashboard (not TUI) for visualization
4. **Installation:** Modular (barebones vs full)
5. **External deps:** Zero external APIs, runs in project folder
6. **Existing tools:** Extends Memorix (Approach A from design phase)

---

## References

- Memorix: MCP-based memory layer for agents
- Tokscale: Token tracking architecture
- Claude Code: SessionStart/SessionEnd hook system
- OpenCode: AGENTS.md configuration pattern
