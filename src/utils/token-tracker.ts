import { encodingForModel } from 'js-tiktoken';

/**
 * Represents a single token tracking log entry
 */
export interface TokenLogEntry {
  timestamp: string; // ISO 8601 format
  model: string;
  tokens: number;
  agent: string;
  project: string;
}

/**
 * Estimates the number of tokens in the given text
 * Uses js-tiktoken for accurate counting with "gpt-3.5-turbo" encoding
 * Falls back to character count / 4 if tiktoken fails or unavailable
 *
 * @param text - The text to estimate tokens for
 * @returns Estimated token count as an integer
 */
export function estimateTokens(text: string): number {
  try {
    // Get the encoding for gpt-3.5-turbo
    const enc = encodingForModel('gpt-3.5-turbo');
    // Encode the text and get token count
    const tokens = enc.encode(text);
    return tokens.length;
  } catch (error) {
    // Fallback: use character count / 4 as rough estimate
    // This is a common approximation for English text
    return Math.ceil(text.length / 4);
  }
}

/**
 * Formats a TokenLogEntry as a JSON string
 * Used for writing individual entries to the token log (NDJSON format)
 *
 * @param entry - The token log entry to format
 * @returns JSON string representation of the entry
 */
export function formatTokenLogEntry(entry: TokenLogEntry): string {
  return JSON.stringify(entry);
}

/**
 * Parses newline-delimited JSON (NDJSON) content into TokenLogEntry objects
 * Each line should be a valid JSON object representing a TokenLogEntry
 * Invalid lines are skipped silently
 *
 * @param content - The NDJSON content to parse
 * @returns Array of parsed TokenLogEntry objects
 */
export function parseTokenLog(content: string): TokenLogEntry[] {
  const entries: TokenLogEntry[] = [];

  // Handle empty content
  if (!content || !content.trim()) {
    return entries;
  }

  // Split by newlines
  const lines = content.split('\n');

  for (const line of lines) {
    // Skip empty lines
    if (!line.trim()) {
      continue;
    }

    try {
      // Try to parse the line as JSON
      const entry = JSON.parse(line) as TokenLogEntry;
      // Validate that it has the required properties
      if (
        entry.timestamp &&
        entry.model &&
        typeof entry.tokens === 'number' &&
        entry.agent &&
        entry.project
      ) {
        entries.push(entry);
      }
    } catch {
      // Skip invalid JSON lines silently
      // This allows partial recovery from corrupted logs
    }
  }

  return entries;
}
