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
import * as os from "node:os";
import * as path from "node:path";

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
  const seen = new Set<string>();
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
    if (text && !seen.has(text)) {
      seen.add(text);
      chunks.push(text);
    }
  }
  return chunks.join("\n\n");
}

/** Best-effort recursive extraction of plain text from a transcript node. */
function extractText(node: unknown): string {
  if (typeof node === "string") return node;
  if (!node || typeof node !== "object") return "";

  const rec = node as Record<string, unknown>;
  const type = typeof rec.type === "string" ? rec.type : "";

  // Skip metadata: Codex stores large base instructions here, not user work.
  if (type === "session_meta") return "";

  // Codex top-level event wrapper shapes.
  if (type === "response_item" && "payload" in rec) {
    return extractText(rec.payload);
  }
  if (type === "event_msg" && "payload" in rec) {
    const payload = rec.payload;
    if (payload && typeof payload === "object") {
      const p = payload as Record<string, unknown>;
      if (
        p.type === "agent_message" &&
        typeof p.message === "string"
      ) {
        return p.message;
      }
    }
    return "";
  }

  // Standard shape: { message: { content: ... } }
  if ("message" in rec) {
    const msg = rec.message;
    const nested = extractText(msg);
    if (nested) return nested;
  }

  // { content: "..." | [{ type, text }, ...] }
  if ("content" in rec) {
    if (typeof rec.role === "string" && rec.role !== "assistant") return "";
    const c = rec.content;
    if (typeof c === "string") return c;
    if (Array.isArray(c)) {
      return c
        .map((part) => {
          if (typeof part === "string") return part;
          if (part && typeof part === "object") {
            const p = part as Record<string, unknown>;
            if (typeof p.text === "string") return p.text;
            if (typeof p.input_text === "string") return p.input_text;
            if (typeof p.output_text === "string") return p.output_text;
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

export interface TranscriptLookupInput {
  session_id?: string;
}

/**
 * Locate Codex's persisted JSONL transcript when hook stdin omits
 * `transcript_path`. Codex stores sessions below
 * `~/.codex/sessions/YYYY/MM/DD/rollout-...<session-id>.jsonl`.
 */
export async function findCodexTranscript(
  input: TranscriptLookupInput,
  projectRoot: string,
  codexHome: string = process.env.CODEX_HOME || path.join(os.homedir(), ".codex"),
): Promise<string | undefined> {
  const sessionsDir = path.join(codexHome, "sessions");
  const files = await listJsonlFiles(sessionsDir);

  if (input.session_id) {
    const byId = files.find((file) => file.includes(input.session_id!));
    if (byId) return byId;
  }

  const candidates: Array<{ file: string; mtimeMs: number }> = [];
  for (const file of files) {
    const meta = await readSessionMeta(file);
    if (meta?.cwd !== projectRoot) continue;
    const stat = await fs.stat(file).catch(() => undefined);
    if (stat) candidates.push({ file, mtimeMs: stat.mtimeMs });
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0]?.file;
}

/**
 * Reconstruct text from OpenCode's local JSON storage. OpenCode persists
 * sessions in `~/.local/share/opencode/storage/session`, messages in
 * `storage/message/<session-id>`, and message parts in
 * `storage/part/<message-id>`.
 */
export async function readOpenCodeTranscriptText(
  input: TranscriptLookupInput,
  projectRoot: string,
  dataHome: string =
    process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"),
): Promise<string> {
  const storageRoot = path.join(dataHome, "opencode", "storage");
  const sessionId =
    input.session_id || (await findLatestOpenCodeSession(projectRoot, storageRoot));
  if (!sessionId) return "";

  const messageDir = path.join(storageRoot, "message", sessionId);
  let entries: Array<import("node:fs").Dirent>;
  try {
    entries = await fs.readdir(messageDir, { withFileTypes: true });
  } catch {
    return "";
  }

  const messages: Array<{ id: string; role: string; created: number }> = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const message = await readJsonFile<Record<string, unknown>>(
      path.join(messageDir, entry.name),
    );
    if (!message) continue;
    if (message.role !== "assistant") continue;
    if (typeof message.id !== "string") continue;
    const time = message.time as { created?: unknown } | undefined;
    messages.push({
      id: message.id,
      role: "assistant",
      created: typeof time?.created === "number" ? time.created : 0,
    });
  }

  messages.sort((a, b) => a.created - b.created);
  const chunks: string[] = [];
  const seen = new Set<string>();
  for (const message of messages) {
    const text = await readOpenCodeMessageParts(storageRoot, message.id);
    if (text && !seen.has(text)) {
      seen.add(text);
      chunks.push(text);
    }
  }
  return chunks.join("\n\n");
}

async function listJsonlFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries: Array<import("node:fs").Dirent>;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && full.endsWith(".jsonl")) {
        out.push(full);
      }
    }
  }
  await walk(root);
  return out;
}

async function readSessionMeta(file: string): Promise<{ id?: string; cwd?: string } | undefined> {
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    return undefined;
  }

  const first = raw.split("\n").find((line) => line.trim());
  if (!first) return undefined;
  try {
    const parsed = JSON.parse(first) as {
      type?: string;
      payload?: { id?: string; cwd?: string };
    };
    if (parsed.type !== "session_meta") return undefined;
    return parsed.payload;
  } catch {
    return undefined;
  }
}

async function findLatestOpenCodeSession(
  projectRoot: string,
  storageRoot: string,
): Promise<string | undefined> {
  const sessionRoot = path.join(storageRoot, "session");
  const files = await listJsonFiles(sessionRoot);
  const candidates: Array<{ id: string; updated: number }> = [];
  for (const file of files) {
    const session = await readJsonFile<Record<string, unknown>>(file);
    if (!session || session.directory !== projectRoot) continue;
    if (typeof session.id !== "string") continue;
    const time = session.time as { updated?: unknown; created?: unknown } | undefined;
    const updated =
      typeof time?.updated === "number"
        ? time.updated
        : typeof time?.created === "number"
          ? time.created
          : 0;
    candidates.push({ id: session.id, updated });
  }
  candidates.sort((a, b) => b.updated - a.updated);
  return candidates[0]?.id;
}

async function readOpenCodeMessageParts(
  storageRoot: string,
  messageId: string,
): Promise<string> {
  const partDir = path.join(storageRoot, "part", messageId);
  let entries: Array<import("node:fs").Dirent>;
  try {
    entries = await fs.readdir(partDir, { withFileTypes: true });
  } catch {
    return "";
  }

  const parts: Array<{ text: string; name: string }> = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const part = await readJsonFile<Record<string, unknown>>(
      path.join(partDir, entry.name),
    );
    if (!part || part.type !== "text" || typeof part.text !== "string") continue;
    parts.push({ text: part.text, name: entry.name });
  }
  parts.sort((a, b) => a.name.localeCompare(b.name));
  return parts.map((part) => part.text).join("\n");
}

async function listJsonFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries: Array<import("node:fs").Dirent>;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && full.endsWith(".json")) {
        out.push(full);
      }
    }
  }
  await walk(root);
  return out;
}

async function readJsonFile<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return undefined;
  }
}
