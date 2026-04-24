#!/usr/bin/env node
/**
 * SessionEnd hook: invoked when an agent session terminates. Reads the
 * session transcript (path from env var or first CLI arg), extracts key
 * snippets, and appends them to the project's `.kernel/MEMORY.md`.
 *
 * Silent on success; exits 0 on error so a Kernel failure cannot prevent
 * the agent from shutting down.
 */

import { appendMemory } from "../memory.js";
import { extractSnippets } from "../session-scanner.js";
import { appendTokenLog } from "../token-log.js";
import {
  readHookInput,
  resolveProjectRoot,
  readTranscriptText,
  findCodexTranscript,
  type HookInput,
} from "./hook-input.js";

export interface SessionEndOptions {
  projectRoot?: string;
  agent?: string;
  model?: string;
  /** When provided, skips disk read and uses this text directly (tests). */
  sessionText?: string;
  /** Pre-parsed hook input (skips stdin read). */
  hookInput?: HookInput;
}

export async function runSessionEnd(opts: SessionEndOptions = {}): Promise<number> {
  const input: HookInput =
    opts.hookInput ??
    (opts.sessionText === undefined && !opts.projectRoot
      ? await readHookInput().catch(() => ({}))
      : {});

  const projectRoot = opts.projectRoot || resolveProjectRoot(input);
  const agent =
    opts.agent ||
    process.env.AGENT_TYPE ||
    process.argv[2] ||
    "claude-code";
  const model =
    opts.model ||
    input.model ||
    process.env.KERNEL_MODEL ||
    process.env.CLAUDE_MODEL ||
    process.env.OPENAI_MODEL ||
    "unknown-model";

  let text = opts.sessionText;
  if (text === undefined) {
    const transcriptPath =
      input.transcript_path ||
      (agent === "codex"
        ? await findCodexTranscript(input, projectRoot).catch(() => undefined)
        : undefined);
    text = await readTranscriptText(transcriptPath);
    if (!text) return 0;
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
