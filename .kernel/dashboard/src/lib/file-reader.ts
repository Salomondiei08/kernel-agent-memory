/**
 * File Reader for Kernel Dashboard
 * Reads token logs and memory entries from .kernel/ directory
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import type { TokenEntry, MemoryEntry, TokenStats, DashboardData } from './types';

const KERNEL_DIR = join(process.cwd(), '..', '..');

/**
 * Read and parse NDJSON token log file
 * Each line is a separate JSON object: { timestamp, date, model, tokens, agent, project }
 */
export function readTokenLog(): TokenEntry[] {
  try {
    const tokenLogPath = join(KERNEL_DIR, '.kernel', 'token-log.json');
    const content = readFileSync(tokenLogPath, 'utf-8');

    if (!content.trim()) {
      return [];
    }

    const lines = content.trim().split('\n');
    return lines
      .filter(line => line.trim())
      .map(line => {
        try {
          return JSON.parse(line) as TokenEntry;
        } catch {
          console.warn('Failed to parse token entry:', line);
          return null;
        }
      })
      .filter((entry): entry is TokenEntry => entry !== null);
  } catch (error) {
    console.warn('Failed to read token log:', error);
    return [];
  }
}

/**
 * Parse MEMORY.md entries
 * Format: [agent-name | timestamp] category: content
 */
export function readMemory(): MemoryEntry[] {
  try {
    const memoryPath = join(KERNEL_DIR, '.kernel', 'MEMORY.md');
    const content = readFileSync(memoryPath, 'utf-8');

    const entries: MemoryEntry[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const match = line.match(/^\[([^\|]+)\s*\|\s*([^\]]+)\]\s*([^:]*?):\s*(.+)$/);
      if (match) {
        const [, agent, timestamp, category, value] = match;
        entries.push({
          key: `${agent}-${timestamp}`,
          value: value.trim(),
          agent: agent.trim(),
          timestamp: timestamp.trim(),
          category: category.trim() || undefined,
        });
      }
    }

    return entries;
  } catch (error) {
    console.warn('Failed to read memory:', error);
    return [];
  }
}

/**
 * Calculate token statistics from entries
 */
export function calculateTokenStats(tokens: TokenEntry[]): TokenStats {
  const stats: TokenStats = {
    totalTokens: 0,
    averagePerDay: 0,
    tokensByModel: {},
    tokensByAgent: {},
    tokensByProject: {},
    lastUpdated: new Date().toISOString(),
  };

  if (tokens.length === 0) {
    return stats;
  }

  // Calculate totals
  for (const entry of tokens) {
    stats.totalTokens += entry.tokens;
    stats.tokensByModel[entry.model] = (stats.tokensByModel[entry.model] || 0) + entry.tokens;
    stats.tokensByAgent[entry.agent] = (stats.tokensByAgent[entry.agent] || 0) + entry.tokens;
    stats.tokensByProject[entry.project] = (stats.tokensByProject[entry.project] || 0) + entry.tokens;
  }

  // Calculate average per day
  const uniqueDates = new Set(tokens.map(t => t.date));
  stats.averagePerDay = uniqueDates.size > 0 ? stats.totalTokens / uniqueDates.size : 0;

  return stats;
}

/**
 * Get tokens from last N days
 */
export function getTokensLast(tokens: TokenEntry[], days: number): TokenEntry[] {
  const now = new Date();
  const cutoffDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  return tokens.filter(token => {
    const tokenDate = new Date(token.timestamp);
    return tokenDate >= cutoffDate;
  });
}

/**
 * Aggregate tokens by date for charting
 */
export function aggregateTokensByDate(tokens: TokenEntry[]): Array<{ date: string; tokens: number }> {
  const aggregated: Record<string, number> = {};

  for (const token of tokens) {
    aggregated[token.date] = (aggregated[token.date] || 0) + token.tokens;
  }

  return Object.entries(aggregated)
    .map(([date, tokens]) => ({ date, tokens }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Aggregate tokens by model for charting
 */
export function aggregateTokensByModel(
  tokens: TokenEntry[]
): Array<{ model: string; tokens: number }> {
  const aggregated: Record<string, number> = {};

  for (const token of tokens) {
    aggregated[token.model] = (aggregated[token.model] || 0) + token.tokens;
  }

  return Object.entries(aggregated)
    .map(([model, tokens]) => ({ model, tokens }))
    .sort((a, b) => b.tokens - a.tokens);
}

/**
 * Aggregate tokens by agent for charting
 */
export function aggregateTokensByAgent(tokens: TokenEntry[]): Array<{ agent: string; tokens: number }> {
  const aggregated: Record<string, number> = {};

  for (const token of tokens) {
    aggregated[token.agent] = (aggregated[token.agent] || 0) + token.tokens;
  }

  return Object.entries(aggregated)
    .map(([agent, tokens]) => ({ agent, tokens }))
    .sort((a, b) => b.tokens - a.tokens);
}

/**
 * Load all dashboard data
 */
export function loadDashboardData(): DashboardData {
  const tokens = readTokenLog();
  const memory = readMemory();
  const stats = calculateTokenStats(tokens);

  return {
    tokens,
    memory,
    stats,
  };
}
