/**
 * Shared helpers for Claude Code hook handlers.
 *
 * Claude Code invokes hooks as subprocesses and passes a JSON payload on
 * stdin containing at least:
 *   - session_id: string
 *   - transcript_path: string  (path to the session's JSONL transcript)
 *   - cwd: string              (project root at hook invocation time)
 *   - hook_event_name: string  ("SessionStart" | "SessionEnd" | ...)
 *   - source?: string          (SessionStart only — "startup" | "resume" | ...)
 *   - model?: string           (SessionStart only)
 *   - reason?: string          (SessionEnd only — "exit" | ...)
 *
 * It also sets CLAUDE_PROJECT_DIR in the env. Codex/OpenCode are assumed to
 * follow the same (or compatible) protocol where supported; we degrade
 * gracefully when fields are missing.
 */

import { promises as fs } from "node:fs";

export interface HookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  hook_event_name?: string;
  source?: string;
  model?: string;
  reason?: string;
}

/**
 * Read all of process.stdin as a string. Resolves to "" if stdin is a TTY
 * (running the script by hand for debugging).
 */
export function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve("");
      return;
    }
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(data));
  });
}

/** Parse stdin as hook-input JSON. Returns {} on any failure. */
export async function readHookInput(): Promise<HookInput> {
  const raw = await readStdin();
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw) as HookInput;
  } catch {
    return {};
  }
}

/**
 * Resolve the project root from available signals, in order of preference:
 *   1. hook JSON cwd
 *   2. CLAUDE_PROJECT_DIR env
 *   3. KERNEL_PROJECT_ROOT env (kernel-specific override)
 *   4. process.cwd()
 */
export function resolveProjectRoot(input: HookInput): string {
  return (
    input.cwd ||
    process.env.CLAUDE_PROJECT_DIR ||
    process.env.KERNEL_PROJECT_ROOT ||
    process.cwd()
  );
}

/**
 * Read a Claude Code JSONL transcript and return the concatenated text
 * content of every user/assistant message. Returns "" if the file is
 * missing or unparseable.
 *
 * Claude transcripts store each line as an event with a `message` object.
 * The message's `content` may be a plain string (user messages) or an
 * array of `{type, text}` parts (assistant messages with tool use etc.).
 */
export async function readTranscriptText(
  transcriptPath: string | undefined,
): Promise<string> {
  if (!transcriptPath) return "";
  let raw: string;
  try {
    raw = await fs.readFile(transcriptPath, "utf8");
  } catch {
    return "";
  }

  const chunks: string[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj: unknown;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const text = extractText(obj);
    if (text) chunks.push(text);
  }
  return chunks.join("\n\n");
}

/** Best-effort recursive extraction of plain text from a transcript node. */
function extractText(node: unknown): string {
  if (typeof node === "string") return node;
  if (!node || typeof node !== "object") return "";

  const rec = node as Record<string, unknown>;

  // Standard shape: { message: { content: ... } }
  if ("message" in rec) {
    const msg = rec.message;
    const nested = extractText(msg);
    if (nested) return nested;
  }

  // { content: "..." | [{ type, text }, ...] }
  if ("content" in rec) {
    const c = rec.content;
    if (typeof c === "string") return c;
    if (Array.isArray(c)) {
      return c
        .map((part) => {
          if (typeof part === "string") return part;
          if (part && typeof part === "object") {
            const p = part as Record<string, unknown>;
            if (typeof p.text === "string") return p.text;
            if (typeof p.input === "object" && p.input !== null) {
              try {
                return JSON.stringify(p.input);
              } catch {
                return "";
              }
            }
          }
          return "";
        })
        .filter(Boolean)
        .join("\n");
    }
  }

  if (typeof rec.text === "string") return rec.text;

  return "";
}
