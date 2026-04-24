#!/usr/bin/env node
/**
 * SessionEnd hook: invoked when an agent session terminates. Reads the
 * session transcript (path from env var or first CLI arg), extracts key
 * snippets, and appends them to the project's `.kernel/MEMORY.md`.
 *
 * Silent on success; exits 0 on error so a Kernel failure cannot prevent
 * the agent from shutting down.
 */

import { promises as fs } from "node:fs";
import { appendMemory } from "../memory.js";
import { extractSnippets } from "../session-scanner.js";
import { appendTokenLog } from "../token-log.js";

export interface SessionEndOptions {
  projectRoot?: string;
  sessionFile?: string;
  agent?: string;
  model?: string;
  /** When provided, skips disk read and uses this text directly (tests). */
  sessionText?: string;
}

export async function runSessionEnd(opts: SessionEndOptions = {}): Promise<number> {
  const projectRoot =
    opts.projectRoot || process.env.KERNEL_PROJECT_ROOT || process.cwd();
  const agent = opts.agent || process.env.AGENT_TYPE || "unknown-agent";
  const model =
    opts.model ||
    process.env.KERNEL_MODEL ||
    process.env.CLAUDE_MODEL ||
    process.env.OPENAI_MODEL ||
    "unknown-model";

  let text = opts.sessionText;
  if (text === undefined) {
    const sessionFile =
      opts.sessionFile ||
      process.env.CLAUDE_SESSION_FILE ||
      process.env.SESSION_FILE ||
      process.argv[2];
    if (!sessionFile) return 0;
    try {
      text = await fs.readFile(sessionFile, "utf8");
    } catch {
      return 0;
    }
  }

  const snippets = extractSnippets(text, agent);
  for (const s of snippets) {
    await appendMemory(projectRoot, { agent, key: s.key, value: s.value });
  }

  await appendTokenLog({ projectRoot, agent, model, text });
  return snippets.length;
}

const isDirect = import.meta.url === `file://${process.argv[1]}`;
if (isDirect) {
  runSessionEnd().catch(() => process.exit(0));
}
