/**
 * Represents a search result from the memory handler
 * Contains metadata about relevance and ranking
 */
export interface SearchResult {
  key: string;
  value: string;
  score: number; // 0-1, where 1.0 is exact match
  timestamp: string;
  agent: string;
}
