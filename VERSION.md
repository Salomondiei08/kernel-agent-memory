# Version History

## 0.0.2

- Reworked Kernel around a zero-dependency hook-based memory MVP for Claude Code, Codex, and OpenCode.
- Added local token usage logging to `.kernel/token-log.json` from the `SessionEnd` hook.
- Prepared the package for public npm distribution as `kernel-agent-memory`.
- Added Claude/Codex hook stdin parsing, Claude JSONL transcript extraction, Codex hook feature enablement, and OpenCode plugin generation.
- Added real Codex transcript discovery for hooks that omit a transcript path, plus README smoke-test and Ollama usage notes.
- Updated development dependencies to the latest TypeScript, Vitest, and Node type definitions.
- Added OpenCode write-back from local session/message/part storage files.
