/**
 * Memory store: read / append structured entries to `.kernel/MEMORY.md`.
 *
 * Each entry has the on-disk shape:
 *
 *   ## [<agent> | <iso-timestamp>] <key>
 *   <multi-line value>
 *
 * We deliberately keep the format human-readable so the user can open
 * MEMORY.md and curate it by hand if desired.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";

export interface MemoryEntry {
  agent: string;
  timestamp: string; // ISO-8601
  key: string;
  value: string;
}

export interface AppendInput {
  agent: string;
  key: string;
  value: string;
  /** Optional override — defaults to `new Date().toISOString()`. */
  timestamp?: string;
}

const HEADER = "# Project Memory\n\n";

/** Returns the absolute path to `<projectRoot>/.kernel/MEMORY.md`. */
export function getMemoryPath(projectRoot: string): string {
  return path.join(projectRoot, ".kernel", "MEMORY.md");
}

/** Ensures the `.kernel` directory and MEMORY.md file exist. */
export async function ensureMemoryFile(projectRoot: string): Promise<string> {
  const file = getMemoryPath(projectRoot);
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    await fs.access(file);
  } catch {
    await fs.writeFile(file, HEADER, "utf8");
  }
  return file;
}

/**
 * Read and parse MEMORY.md into an array of entries in chronological order
 * (oldest first). Returns `[]` if the file does not exist or is empty.
 */
export async function readMemory(projectRoot: string): Promise<MemoryEntry[]> {
  const file = getMemoryPath(projectRoot);
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    return [];
  }

  const entries: MemoryEntry[] = [];
  // Match "## [agent | timestamp] key\nvalue..." blocks.
  const headerRe = /^## \[([^|\]]+)\s*\|\s*([^\]]+)\]\s*(.+)$/gm;
  const matches: { start: number; end: number; agent: string; ts: string; key: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = headerRe.exec(raw)) !== null) {
    matches.push({
      start: m.index,
      end: m.index + m[0].length,
      agent: m[1].trim(),
      ts: m[2].trim(),
      key: m[3].trim(),
    });
  }

  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const next = matches[i + 1];
    const valueSlice = raw.slice(cur.end, next ? next.start : raw.length);
    entries.push({
      agent: cur.agent,
      timestamp: cur.ts,
      key: cur.key,
      value: valueSlice.trim(),
    });
  }

  return entries;
}

/** Append a single entry to MEMORY.md, creating the file if needed. */
export async function appendMemory(
  projectRoot: string,
  input: AppendInput,
): Promise<void> {
  const file = await ensureMemoryFile(projectRoot);
  const ts = input.timestamp ?? new Date().toISOString();
  const block = `## [${input.agent} | ${ts}] ${input.key}\n${input.value.trim()}\n\n`;

  const existing = await fs.readFile(file, "utf8");
  // Guarantee there's a blank line between the previous content and this block.
  const sep = existing.endsWith("\n\n") || existing.length === 0 ? "" : existing.endsWith("\n") ? "\n" : "\n\n";
  await fs.writeFile(file, existing + sep + block, "utf8");
}

/** Returns the `limit` most recent entries (newest first). */
export async function getRecentMemory(
  projectRoot: string,
  limit = 5,
): Promise<MemoryEntry[]> {
  const all = await readMemory(projectRoot);
  return all.slice(-limit).reverse();
}
