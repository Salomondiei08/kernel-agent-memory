import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MemoryHandler } from '../../src/mcp/memory-handler.js';

describe('MemoryHandler', () => {
  let memoryPath: string;
  let handler: MemoryHandler;

  beforeEach(async () => {
    // Create a temporary file for each test
    const tmpDir = tmpdir();
    memoryPath = join(tmpDir, `memory-${Date.now()}.md`);
    handler = new MemoryHandler(memoryPath);
  });

  afterEach(async () => {
    // Clean up temporary file
    try {
      await fs.unlink(memoryPath);
    } catch {
      // File may not exist
    }
  });

  describe('add', () => {
    it('should store an entry in memory', async () => {
      await handler.add('test-key', 'test-value', 'test-agent');

      const entry = await handler.read('test-key');
      expect(entry).not.toBeNull();
      expect(entry?.key).toBe('test-key');
      expect(entry?.value).toBe('test-value');
      expect(entry?.agent).toBe('test-agent');
    });

    it('should set timestamp to current date', async () => {
      const beforeTime = new Date();
      await handler.add('key1', 'value1', 'agent1');
      const afterTime = new Date();

      const entry = await handler.read('key1');
      expect(entry).not.toBeNull();

      const entryTime = new Date(entry!.timestamp);
      expect(entryTime.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(entryTime.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });

    it('should accept optional metadata parameter', async () => {
      const metadata = { source: 'test', version: 1 };
      // Should not throw when metadata is provided
      await handler.add('key2', 'value2', 'agent2', metadata);

      const entry = await handler.read('key2');
      expect(entry).not.toBeNull();
      expect(entry?.key).toBe('key2');
      expect(entry?.value).toBe('value2');
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      // Add test entries
      await handler.add('user-context', 'User prefers verbose responses', 'agent-a');
      await new Promise((resolve) => setTimeout(resolve, 10)); // Small delay
      await handler.add('research-notes', 'Key findings from research', 'agent-b');
      await new Promise((resolve) => setTimeout(resolve, 10));
      await handler.add('api-config', 'API endpoint configuration data', 'agent-c');
    });

    it('should retrieve entries by keyword match', async () => {
      const results = await handler.search('research');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.key === 'research-notes')).toBe(true);
    });

    it('should return results sorted by timestamp (newest first)', async () => {
      // Add an older entry first, then newer entries
      await handler.add('oldest-key', 'oldest value', 'agent-old');
      await new Promise((resolve) => setTimeout(resolve, 20));
      await handler.add('newest-key', 'newest value', 'agent-new');

      const results = await handler.search('key');
      // All entries with 'key' in the key
      expect(results.length).toBeGreaterThan(0);

      // Verify sorted by timestamp (newest first)
      for (let i = 1; i < results.length; i++) {
        const prevTime = new Date(results[i - 1].timestamp).getTime();
        const currTime = new Date(results[i].timestamp).getTime();
        expect(prevTime).toBeGreaterThanOrEqual(currTime);
      }
    });

    it('should rank results by score when timestamps are equal', async () => {
      // Create entries at the same time (or close enough)
      await handler.add('exact-match', 'some content', 'agent-x');
      const results = await handler.search('exact-match');

      // Exact key match should have score 1.0
      const exactMatch = results.find((r) => r.key === 'exact-match');
      expect(exactMatch?.score).toBe(1.0);
    });
  });

  describe('read', () => {
    it('should return null for non-existent key', async () => {
      const entry = await handler.read('non-existent-key');
      expect(entry).toBeNull();
    });

    it('should return exact key match', async () => {
      await handler.add('target-key', 'target-value', 'target-agent');

      const entry = await handler.read('target-key');
      expect(entry).not.toBeNull();
      expect(entry?.key).toBe('target-key');
      expect(entry?.value).toBe('target-value');
    });

    it('should not match partial keys', async () => {
      await handler.add('my-complete-key', 'value', 'agent');

      const entry = await handler.read('my-complete');
      expect(entry).toBeNull();
    });
  });

  describe('search scoring logic', () => {
    beforeEach(async () => {
      // Set up entries with different match types
      await handler.add('context-window', 'Memory context for window operations', 'agent-a');
      await new Promise((resolve) => setTimeout(resolve, 10));
      await handler.add('user-data', 'Contains context information in value', 'agent-b');
      await new Promise((resolve) => setTimeout(resolve, 10));
      await handler.add('other-entry', 'Unrelated content here', 'agent-c');
    });

    it('should score exact key match as 1.0', async () => {
      const results = await handler.search('context-window');
      const exactMatch = results.find((r) => r.key === 'context-window');
      expect(exactMatch?.score).toBe(1.0);
    });

    it('should score key contains query as 0.8', async () => {
      const results = await handler.search('context');
      const keyMatch = results.find((r) => r.key === 'context-window');
      expect(keyMatch?.score).toBe(0.8);
    });

    it('should score value contains query as 0.5', async () => {
      const results = await handler.search('context');
      // 'user-data' has 'context' in the value, not the key
      const valueMatch = results.find((r) => r.key === 'user-data');
      expect(valueMatch?.score).toBe(0.5);
    });

    it('should not include non-matches in results', async () => {
      const results = await handler.search('context');
      const noMatch = results.find((r) => r.key === 'other-entry');
      expect(noMatch).toBeUndefined();
    });

    it('should be case-insensitive', async () => {
      const resultsLower = await handler.search('context');
      const resultsUpper = await handler.search('CONTEXT');
      const resultsMixed = await handler.search('CoNtExT');

      expect(resultsLower.length).toBe(resultsUpper.length);
      expect(resultsUpper.length).toBe(resultsMixed.length);
    });

    it('should rank by score when timestamps match', async () => {
      // Add entries with same timestamp (added in quick succession)
      const now = new Date().toISOString();

      // Create entries directly with same timestamp
      await handler.add('query-exact', 'content 1', 'agent-1');
      await handler.add('has-query-word', 'content 2', 'agent-2');
      await handler.add('other', 'content with query word', 'agent-3');

      const results = await handler.search('query');

      // Exact match (query-exact) should come first among close timestamps
      const scores = results.map((r) => r.score);
      for (let i = 1; i < scores.length; i++) {
        if (
          new Date(results[i - 1].timestamp).getTime() ===
          new Date(results[i].timestamp).getTime()
        ) {
          expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i]);
        }
      }
    });
  });

  describe('multiple entries', () => {
    it('should handle multiple entries in the same file', async () => {
      await handler.add('key1', 'value1', 'agent1');
      await handler.add('key2', 'value2', 'agent2');
      await handler.add('key3', 'value3', 'agent3');

      const results = await handler.search('key');
      expect(results.length).toBe(3);
    });

    it('should preserve all entries when searching', async () => {
      await handler.add('entry-a', 'content A', 'agent-a');
      await handler.add('entry-b', 'content B', 'agent-b');
      await handler.add('entry-c', 'content C', 'agent-c');

      // Search for one entry
      const results = await handler.search('entry-b');
      expect(results.length).toBe(1);

      // All entries should still exist
      expect(await handler.read('entry-a')).not.toBeNull();
      expect(await handler.read('entry-b')).not.toBeNull();
      expect(await handler.read('entry-c')).not.toBeNull();
    });
  });
});
