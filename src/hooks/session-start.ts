#!/usr/bin/env node
/**
 * SessionStart hook: invoked by Claude Code / Codex / OpenCode when a new
 * session begins. Reads the 5 most recent memory entries from the current
 * project's `.kernel/MEMORY.md` and prints them to stdout.
 *
 * Claude Code's hook protocol injects stdout into the agent's system context,
 * so this is how the next session "remembers" the last one.
 *
 * Silent if there's no memory yet. Exits 0 on any error to avoid blocking
 * session startup.
 */

import { getRecentMemory } from "../memory.js";
import { readHookInput, resolveProjectRoot } from "./hook-input.js";

export async function runSessionStart(
  projectRoot?: string,
): Promise<string> {
  const root =
    projectRoot ||
    resolveProjectRoot(await readHookInput().catch(() => ({})));
  const entries = await getRecentMemory(root, 5);
  if (entries.length === 0) return "";

  const lines: string[] = ["# Project Context (from Kernel)", ""];
  for (const e of entries) {
    const oneLine = e.value.replace(/\s*\n\s*/g, " ").trim();
    lines.push(`- **${e.key}**: ${oneLine}`);
  }
  return lines.join("\n") + "\n";
}

// CLI entry point — only runs when executed directly, not when imported by tests.
const isDirect = import.meta.url === `file://${process.argv[1]}`;
if (isDirect) {
  (async () => {
    try {
      const input = await readHookInput();
      const root = resolveProjectRoot(input);
      const out = await runSessionStart(root);
      if (out) process.stdout.write(out);
    } catch {
      process.exit(0);
    }
  })();
}
