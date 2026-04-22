import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { readMemoryFile, writeMemoryEntry, MemoryEntry } from '../../src/utils/file-ops';

const testDir = join(process.cwd(), '.test-memory');

describe('file-ops', () => {
  beforeEach(async () => {
    // Create test directory
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('readMemoryFile', () => {
    it('returns empty array for missing file', async () => {
      const filePath = join(testDir, 'nonexistent', 'MEMORY.md');
      const result = await readMemoryFile(filePath);
      expect(result).toEqual([]);
    });

    it('parses valid memory entries correctly', async () => {
      const filePath = join(testDir, 'MEMORY.md');
      const content = `[claude-code | 2026-04-22T10:00:00Z] auth-pattern: use RS256 with 1h expiry
[codex | 2026-04-22T11:30:00Z] cache-strategy: redis with TTL 3600`;

      await fs.writeFile(filePath, content, 'utf-8');

      const result = await readMemoryFile(filePath);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        agent: 'claude-code',
        timestamp: '2026-04-22T10:00:00Z',
        key: 'auth-pattern',
        value: 'use RS256 with 1h expiry',
      });
      expect(result[1]).toEqual({
        agent: 'codex',
        timestamp: '2026-04-22T11:30:00Z',
        key: 'cache-strategy',
        value: 'redis with TTL 3600',
      });
    });

    it('skips blank lines', async () => {
      const filePath = join(testDir, 'MEMORY.md');
      const content = `[claude-code | 2026-04-22T10:00:00Z] key1: value1

[codex | 2026-04-22T11:00:00Z] key2: value2

`;

      await fs.writeFile(filePath, content, 'utf-8');

      const result = await readMemoryFile(filePath);

      expect(result).toHaveLength(2);
      expect(result[0].key).toBe('key1');
      expect(result[1].key).toBe('key2');
    });

    it('handles entries with colons in the value', async () => {
      const filePath = join(testDir, 'MEMORY.md');
      const content = `[claude-code | 2026-04-22T10:00:00Z] url: http://example.com:3000`;

      await fs.writeFile(filePath, content, 'utf-8');

      const result = await readMemoryFile(filePath);

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe('http://example.com:3000');
    });

    it('handles entries with spaces around pipes and brackets', async () => {
      const filePath = join(testDir, 'MEMORY.md');
      const content = `[ agent-name | 2026-04-22T10:00:00Z ] key: value`;

      await fs.writeFile(filePath, content, 'utf-8');

      const result = await readMemoryFile(filePath);

      expect(result).toHaveLength(1);
      expect(result[0].agent).toBe('agent-name');
    });

    it('skips lines without proper format', async () => {
      const filePath = join(testDir, 'MEMORY.md');
      const content = `[claude-code | 2026-04-22T10:00:00Z] key: value
This is a malformed line
Another bad line without brackets
[codex | 2026-04-22T11:00:00Z] key2: value2`;

      await fs.writeFile(filePath, content, 'utf-8');

      const result = await readMemoryFile(filePath);

      expect(result).toHaveLength(2);
      expect(result[0].key).toBe('key');
      expect(result[1].key).toBe('key2');
    });
  });

  describe('writeMemoryEntry', () => {
    it('creates file and appends entry', async () => {
      const filePath = join(testDir, 'new', 'MEMORY.md');

      const entry: MemoryEntry = {
        agent: 'claude-code',
        timestamp: '2026-04-22T10:00:00Z',
        key: 'test-key',
        value: 'test-value',
      };

      await writeMemoryEntry(filePath, entry);

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('[claude-code | 2026-04-22T10:00:00Z] test-key: test-value\n');
    });

    it('creates directory if it does not exist', async () => {
      const filePath = join(testDir, 'deeply', 'nested', 'path', 'MEMORY.md');

      const entry: MemoryEntry = {
        agent: 'test-agent',
        timestamp: '2026-04-22T10:00:00Z',
        key: 'nested-key',
        value: 'nested-value',
      };

      await writeMemoryEntry(filePath, entry);

      const exists = await fs
        .stat(filePath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });

    it('appends multiple entries correctly', async () => {
      const filePath = join(testDir, 'multiple', 'MEMORY.md');

      const entry1: MemoryEntry = {
        agent: 'claude-code',
        timestamp: '2026-04-22T10:00:00Z',
        key: 'key1',
        value: 'value1',
      };

      const entry2: MemoryEntry = {
        agent: 'codex',
        timestamp: '2026-04-22T11:00:00Z',
        key: 'key2',
        value: 'value2',
      };

      await writeMemoryEntry(filePath, entry1);
      await writeMemoryEntry(filePath, entry2);

      const result = await readMemoryFile(filePath);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(entry1);
      expect(result[1]).toEqual(entry2);
    });

    it('preserves existing entries when appending', async () => {
      const filePath = join(testDir, 'preserve', 'MEMORY.md');

      const existingContent = `[old-agent | 2026-04-20T10:00:00Z] old-key: old-value\n`;
      await fs.mkdir(join(testDir, 'preserve'), { recursive: true });
      await fs.writeFile(filePath, existingContent, 'utf-8');

      const newEntry: MemoryEntry = {
        agent: 'new-agent',
        timestamp: '2026-04-22T12:00:00Z',
        key: 'new-key',
        value: 'new-value',
      };

      await writeMemoryEntry(filePath, newEntry);

      const result = await readMemoryFile(filePath);

      expect(result).toHaveLength(2);
      expect(result[0].key).toBe('old-key');
      expect(result[1].key).toBe('new-key');
    });

    it('handles entries with special characters in value', async () => {
      const filePath = join(testDir, 'special', 'MEMORY.md');

      const entry: MemoryEntry = {
        agent: 'claude-code',
        timestamp: '2026-04-22T10:00:00Z',
        key: 'special-key',
        value: 'value with "quotes" and [brackets] and | pipes',
      };

      await writeMemoryEntry(filePath, entry);

      const result = await readMemoryFile(filePath);

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe('value with "quotes" and [brackets] and | pipes');
    });

    it('handles entries with empty value', async () => {
      const filePath = join(testDir, 'empty-value', 'MEMORY.md');

      const entry: MemoryEntry = {
        agent: 'claude-code',
        timestamp: '2026-04-22T10:00:00Z',
        key: 'empty-key',
        value: '',
      };

      await writeMemoryEntry(filePath, entry);

      const result = await readMemoryFile(filePath);

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe('');
    });
  });

  describe('round-trip consistency', () => {
    it('preserves entry data through write and read', async () => {
      const filePath = join(testDir, 'roundtrip', 'MEMORY.md');

      const entries: MemoryEntry[] = [
        {
          agent: 'claude-code',
          timestamp: '2026-04-22T10:00:00Z',
          key: 'auth',
          value: 'JWT with RS256',
        },
        {
          agent: 'codex',
          timestamp: '2026-04-22T11:30:00Z',
          key: 'cache',
          value: 'Redis TTL 3600',
        },
        {
          agent: 'opencode',
          timestamp: '2026-04-22T13:15:00Z',
          key: 'database',
          value: 'PostgreSQL 15',
        },
      ];

      for (const entry of entries) {
        await writeMemoryEntry(filePath, entry);
      }

      const result = await readMemoryFile(filePath);

      expect(result).toHaveLength(3);
      for (let i = 0; i < entries.length; i++) {
        expect(result[i]).toEqual(entries[i]);
      }
    });
  });
});
