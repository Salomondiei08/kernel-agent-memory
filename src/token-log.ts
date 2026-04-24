/**
 * Token log utilities for Kernel's local, offline usage tracking.
 *
 * The log is newline-delimited JSON at `.kernel/token-log.json`. NDJSON keeps
 * writes append-only and recoverable if a previous session was interrupted.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";

export interface TokenLogEntry {
  timestamp: string;
  model: string;
  tokens: number;
  agent: string;
  project: string;
  chars: number;
}

export interface TokenLogInput {
  text: string;
  agent: string;
  model: string;
  projectRoot: string;
  timestamp?: string;
}

/** Returns the absolute path to `<projectRoot>/.kernel/token-log.json`. */
export function getTokenLogPath(projectRoot: string): string {
  return path.join(projectRoot, ".kernel", "token-log.json");
}

/**
 * Estimate token count without runtime dependencies.
 *
 * Character count divided by four is a common rough estimate for English and
 * code-like transcripts. It is intentionally conservative and deterministic;
 * a later phase can swap in a tokenizer behind this function.
 */
export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  return Math.ceil(text.length / 4);
}

/** Serialize a token log entry as one NDJSON line. */
export function formatTokenLogEntry(entry: TokenLogEntry): string {
  return JSON.stringify(entry);
}

/** Parse token-log NDJSON, skipping invalid or partial lines. */
export function parseTokenLog(content: string): TokenLogEntry[] {
  const entries: TokenLogEntry[] = [];
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as Partial<TokenLogEntry>;
      if (
        typeof parsed.timestamp === "string" &&
        typeof parsed.model === "string" &&
        typeof parsed.tokens === "number" &&
        typeof parsed.agent === "string" &&
        typeof parsed.project === "string" &&
        typeof parsed.chars === "number"
      ) {
        entries.push(parsed as TokenLogEntry);
      }
    } catch {
      // Keep parsing: one malformed line should not hide the rest of the log.
    }
  }
  return entries;
}

/** Append a single estimated usage entry to `.kernel/token-log.json`. */
export async function appendTokenLog(input: TokenLogInput): Promise<TokenLogEntry> {
  const file = getTokenLogPath(input.projectRoot);
  await fs.mkdir(path.dirname(file), { recursive: true });

  const entry: TokenLogEntry = {
    timestamp: input.timestamp ?? new Date().toISOString(),
    model: input.model,
    tokens: estimateTokens(input.text),
    agent: input.agent,
    project: path.basename(input.projectRoot),
    chars: input.text.length,
  };

  await fs.appendFile(file, formatTokenLogEntry(entry) + "\n", "utf8");
  return entry;
}
