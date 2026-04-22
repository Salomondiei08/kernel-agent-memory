import { readMemoryFile, writeMemoryEntry, MemoryEntry } from '../utils/file-ops.js';
import { SearchResult } from './types.js';

/**
 * Handles memory operations: adding, searching, and reading entries
 * Manages persistence via file-ops and provides search ranking
 */
export class MemoryHandler {
  private memoryPath: string;

  constructor(memoryPath: string) {
    this.memoryPath = memoryPath;
  }

  /**
   * Adds a new memory entry
   * Writes to file via file-ops with timestamp and agent metadata
   *
   * @param key - The memory key
   * @param value - The memory value
   * @param agent - The agent name storing this entry
   * @param metadata - Optional additional metadata
   */
  async add(
    key: string,
    value: string,
    agent: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const entry: MemoryEntry = {
      key,
      value,
      agent,
      timestamp: new Date().toISOString(),
      metadata,
    };

    await writeMemoryEntry(this.memoryPath, entry);
  }

  /**
   * Searches memory entries by query
   * Returns results ranked by recency and keyword relevance
   *
   * @param query - Search query string
   * @returns Array of SearchResult sorted by timestamp (newest first) then score (highest first)
   */
  async search(query: string): Promise<SearchResult[]> {
    const entries = await readMemoryFile(this.memoryPath);
    const results: SearchResult[] = [];

    for (const entry of entries) {
      const score = this.scoreRelevance(entry, query);
      if (score > 0) {
        results.push({
          key: entry.key,
          value: entry.value,
          score,
          timestamp: entry.timestamp,
          agent: entry.agent,
        });
      }
    }

    // Sort by timestamp (newest first), then by score (highest first)
    results.sort((a, b) => {
      const timeCompare = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      if (timeCompare !== 0) return timeCompare;
      return b.score - a.score;
    });

    return results;
  }

  /**
   * Reads a single memory entry by exact key match
   *
   * @param key - The exact key to look up
   * @returns The MemoryEntry if found, null otherwise
   */
  async read(key: string): Promise<MemoryEntry | null> {
    const entries = await readMemoryFile(this.memoryPath);
    return entries.find((e) => e.key === key) || null;
  }

  /**
   * Scores the relevance of an entry to a query
   * Exact key match = 1.0
   * Key contains query = 0.8
   * Value contains query = 0.5
   * No match = 0
   *
   * @param entry - The memory entry to score
   * @param query - The search query
   * @returns Relevance score from 0 to 1
   */
  private scoreRelevance(entry: MemoryEntry, query: string): number {
    const lowerQuery = query.toLowerCase();
    const lowerKey = entry.key.toLowerCase();
    const lowerValue = entry.value.toLowerCase();

    // Exact key match
    if (lowerKey === lowerQuery) {
      return 1.0;
    }

    // Key contains query
    if (lowerKey.includes(lowerQuery)) {
      return 0.8;
    }

    // Value contains query
    if (lowerValue.includes(lowerQuery)) {
      return 0.5;
    }

    // No match
    return 0;
  }
}
