/**
 * Kernel Dashboard Types
 * Matches kernel/src/types.ts structure for token tracking
 */

export interface TokenEntry {
  timestamp: string;
  date: string;
  model: string;
  tokens: number;
  agent: string;
  project: string;
}

export interface MemoryEntry {
  key: string;
  value: string;
  agent: string;
  timestamp: string;
  category?: string;
}

export interface TokenStats {
  totalTokens: number;
  averagePerDay: number;
  tokensByModel: Record<string, number>;
  tokensByAgent: Record<string, number>;
  tokensByProject: Record<string, number>;
  lastUpdated: string;
}

export interface DashboardData {
  tokens: TokenEntry[];
  memory: MemoryEntry[];
  stats: TokenStats;
}
