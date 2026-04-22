import { promises as fs } from 'fs';
import { dirname } from 'path';

/**
 * Represents a memory entry with metadata
 */
export interface MemoryEntry {
  key: string;
  value: string;
  timestamp: string;
  agent: string;
  metadata?: Record<string, unknown>;
}

/**
 * Parses a single memory entry line from MEMORY.md
 * Expected format: [agent-name | 2026-04-22T10:00:00Z] key: value
 *
 * @param line - The line to parse
 * @returns MemoryEntry if parseable, null if the line doesn't match the format
 */
function parseMemoryLine(line: string): MemoryEntry | null {
  // Skip empty or whitespace-only lines
  if (!line.trim()) {
    return null;
  }

  // Match pattern: [agent | timestamp] key: value
  // Allows spaces inside brackets and around pipe separator
  const match = line.match(/^\[\s*([^\|]+?)\s*\|\s*([^\]]+?)\s*\]\s+([^:]+):\s*(.*)$/);

  if (!match) {
    return null;
  }

  const [, agent, timestamp, key, value] = match;

  return {
    agent: agent.trim(),
    timestamp: timestamp.trim(),
    key: key.trim(),
    value: value.trim(),
  };
}

/**
 * Formats a memory entry into the MEMORY.md line format
 * Format: [agent-name | timestamp] key: value
 *
 * @param entry - The memory entry to format
 * @returns Formatted line ready to be written to file
 */
function formatMemoryEntry(entry: MemoryEntry): string {
  return `[${entry.agent} | ${entry.timestamp}] ${entry.key}: ${entry.value}`;
}

/**
 * Reads and parses all memory entries from a MEMORY.md file
 * Returns an empty array if the file doesn't exist
 *
 * @param filePath - Path to the MEMORY.md file
 * @returns Array of parsed MemoryEntry objects
 */
export async function readMemoryFile(filePath: string): Promise<MemoryEntry[]> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const entries: MemoryEntry[] = [];

    for (const line of lines) {
      const entry = parseMemoryLine(line);
      if (entry) {
        entries.push(entry);
      }
    }

    return entries;
  } catch (error) {
    // File doesn't exist or can't be read - return empty array
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    // Re-throw other errors
    throw error;
  }
}

/**
 * Appends a memory entry to a MEMORY.md file
 * Creates the directory and file if they don't exist
 *
 * @param filePath - Path to the MEMORY.md file
 * @param entry - The memory entry to append
 */
export async function writeMemoryEntry(
  filePath: string,
  entry: MemoryEntry,
): Promise<void> {
  // Ensure directory exists
  const dir = dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  // Format the entry as a line
  const line = formatMemoryEntry(entry);

  // Append to file with newline
  try {
    await fs.appendFile(filePath, line + '\n', 'utf-8');
  } catch (error) {
    // If file doesn't exist, create it
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      await fs.writeFile(filePath, line + '\n', 'utf-8');
    } else {
      throw error;
    }
  }
}
