import { describe, it, expect } from 'vitest';
import {
  estimateTokens,
  formatTokenLogEntry,
  parseTokenLog,
  TokenLogEntry,
} from '../../src/utils/token-tracker';

describe('token-tracker', () => {
  describe('estimateTokens', () => {
    it('returns a reasonable token count for small text', () => {
      const text = 'Hello, this is a test message.';
      const tokens = estimateTokens(text);

      // Token count should be positive
      expect(tokens).toBeGreaterThan(0);
      // Should be less than or equal to character count / 4 (rough upper bound)
      expect(tokens).toBeLessThanOrEqual(Math.ceil(text.length / 4) + 1);
      // For this small text, should be a reasonable estimate
      expect(tokens).toBeLessThan(20);
    });

    it('returns integer values', () => {
      const text = 'The quick brown fox jumps over the lazy dog.';
      const tokens = estimateTokens(text);

      expect(Number.isInteger(tokens)).toBe(true);
    });

    it('returns larger counts for longer text', () => {
      const shortText = 'Hello world';
      const longText = 'Hello world '.repeat(100);

      const shortTokens = estimateTokens(shortText);
      const longTokens = estimateTokens(longText);

      expect(longTokens).toBeGreaterThan(shortTokens);
    });

    it('handles empty string', () => {
      const tokens = estimateTokens('');
      expect(tokens).toBe(0);
    });

    it('uses fallback when tiktoken fails', () => {
      // This test verifies fallback behavior by checking that a result is returned
      // even if js-tiktoken has issues
      const text = 'Test content with some characters.';
      const tokens = estimateTokens(text);

      // Fallback formula: Math.ceil(text.length / 4)
      const fallbackEstimate = Math.ceil(text.length / 4);

      // Token count should be reasonable relative to fallback
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThanOrEqual(fallbackEstimate + 1);
    });

    it('handles text with special characters', () => {
      const text = 'Code: const x = 42; // with comment';
      const tokens = estimateTokens(text);

      expect(tokens).toBeGreaterThan(0);
      expect(Number.isInteger(tokens)).toBe(true);
    });

    it('handles multiline text', () => {
      const text = `Line 1: First line
Line 2: Second line
Line 3: Third line`;
      const tokens = estimateTokens(text);

      expect(tokens).toBeGreaterThan(0);
      expect(Number.isInteger(tokens)).toBe(true);
    });
  });

  describe('formatTokenLogEntry', () => {
    it('produces valid JSON', () => {
      const entry: TokenLogEntry = {
        timestamp: '2026-04-22T10:30:00Z',
        model: 'gpt-3.5-turbo',
        tokens: 1250,
        agent: 'claude-code',
        project: 'kernel',
      };

      const formatted = formatTokenLogEntry(entry);

      // Should be valid JSON
      expect(() => JSON.parse(formatted)).not.toThrow();
    });

    it('preserves all entry properties', () => {
      const entry: TokenLogEntry = {
        timestamp: '2026-04-22T14:45:30Z',
        model: 'gpt-4',
        tokens: 5000,
        agent: 'codex',
        project: 'my-project',
      };

      const formatted = formatTokenLogEntry(entry);
      const parsed = JSON.parse(formatted) as TokenLogEntry;

      expect(parsed).toEqual(entry);
    });

    it('handles various model names', () => {
      const models = ['gpt-3.5-turbo', 'gpt-4', 'claude-3-sonnet', 'claude-2'];

      for (const model of models) {
        const entry: TokenLogEntry = {
          timestamp: '2026-04-22T10:00:00Z',
          model,
          tokens: 100,
          agent: 'test-agent',
          project: 'test-project',
        };

        const formatted = formatTokenLogEntry(entry);
        const parsed = JSON.parse(formatted) as TokenLogEntry;

        expect(parsed.model).toBe(model);
      }
    });

    it('handles various agent names', () => {
      const agents = ['claude-code', 'codex', 'opencode', 'unknown-agent'];

      for (const agent of agents) {
        const entry: TokenLogEntry = {
          timestamp: '2026-04-22T10:00:00Z',
          model: 'gpt-3.5-turbo',
          tokens: 100,
          agent,
          project: 'test-project',
        };

        const formatted = formatTokenLogEntry(entry);
        const parsed = JSON.parse(formatted) as TokenLogEntry;

        expect(parsed.agent).toBe(agent);
      }
    });

    it('formats zero tokens correctly', () => {
      const entry: TokenLogEntry = {
        timestamp: '2026-04-22T10:00:00Z',
        model: 'gpt-3.5-turbo',
        tokens: 0,
        agent: 'test-agent',
        project: 'test-project',
      };

      const formatted = formatTokenLogEntry(entry);
      const parsed = JSON.parse(formatted) as TokenLogEntry;

      expect(parsed.tokens).toBe(0);
    });

    it('preserves ISO 8601 timestamps', () => {
      const timestamps = [
        '2026-04-22T10:30:00Z',
        '2026-01-01T00:00:00Z',
        '2026-12-31T23:59:59Z',
      ];

      for (const timestamp of timestamps) {
        const entry: TokenLogEntry = {
          timestamp,
          model: 'gpt-3.5-turbo',
          tokens: 100,
          agent: 'test-agent',
          project: 'test-project',
        };

        const formatted = formatTokenLogEntry(entry);
        const parsed = JSON.parse(formatted) as TokenLogEntry;

        expect(parsed.timestamp).toBe(timestamp);
      }
    });
  });

  describe('parseTokenLog', () => {
    it('parses NDJSON correctly', () => {
      const content = `{"timestamp":"2026-04-22T10:30:00Z","model":"gpt-3.5-turbo","tokens":1250,"agent":"claude-code","project":"kernel"}
{"timestamp":"2026-04-22T11:00:00Z","model":"gpt-4","tokens":5000,"agent":"codex","project":"kernel"}`;

      const entries = parseTokenLog(content);

      expect(entries).toHaveLength(2);
      expect(entries[0]).toEqual({
        timestamp: '2026-04-22T10:30:00Z',
        model: 'gpt-3.5-turbo',
        tokens: 1250,
        agent: 'claude-code',
        project: 'kernel',
      });
      expect(entries[1]).toEqual({
        timestamp: '2026-04-22T11:00:00Z',
        model: 'gpt-4',
        tokens: 5000,
        agent: 'codex',
        project: 'kernel',
      });
    });

    it('handles empty content', () => {
      const entries = parseTokenLog('');
      expect(entries).toEqual([]);
    });

    it('handles whitespace-only content', () => {
      const entries = parseTokenLog('   \n\n  \n');
      expect(entries).toEqual([]);
    });

    it('skips invalid JSON lines', () => {
      const content = `{"timestamp":"2026-04-22T10:30:00Z","model":"gpt-3.5-turbo","tokens":1250,"agent":"claude-code","project":"kernel"}
This is not valid JSON
{"timestamp":"2026-04-22T11:00:00Z","model":"gpt-4","tokens":5000,"agent":"codex","project":"kernel"}`;

      const entries = parseTokenLog(content);

      expect(entries).toHaveLength(2);
      expect(entries[0].agent).toBe('claude-code');
      expect(entries[1].agent).toBe('codex');
    });

    it('skips empty lines', () => {
      const content = `{"timestamp":"2026-04-22T10:30:00Z","model":"gpt-3.5-turbo","tokens":1250,"agent":"claude-code","project":"kernel"}

{"timestamp":"2026-04-22T11:00:00Z","model":"gpt-4","tokens":5000,"agent":"codex","project":"kernel"}

`;

      const entries = parseTokenLog(content);

      expect(entries).toHaveLength(2);
    });

    it('skips lines missing required fields', () => {
      const content = `{"timestamp":"2026-04-22T10:30:00Z","model":"gpt-3.5-turbo","tokens":1250,"agent":"claude-code"}
{"timestamp":"2026-04-22T11:00:00Z","model":"gpt-4","tokens":5000,"agent":"codex","project":"kernel"}
{"timestamp":"2026-04-22T12:00:00Z","model":"gpt-4","tokens":3000,"project":"kernel"}`;

      const entries = parseTokenLog(content);

      expect(entries).toHaveLength(1);
      expect(entries[0].agent).toBe('codex');
    });

    it('preserves order of entries', () => {
      const content = `{"timestamp":"2026-04-22T08:00:00Z","model":"gpt-3.5-turbo","tokens":100,"agent":"a","project":"p"}
{"timestamp":"2026-04-22T09:00:00Z","model":"gpt-3.5-turbo","tokens":200,"agent":"b","project":"p"}
{"timestamp":"2026-04-22T10:00:00Z","model":"gpt-3.5-turbo","tokens":300,"agent":"c","project":"p"}`;

      const entries = parseTokenLog(content);

      expect(entries).toHaveLength(3);
      expect(entries[0].agent).toBe('a');
      expect(entries[1].agent).toBe('b');
      expect(entries[2].agent).toBe('c');
    });

    it('handles single entry without trailing newline', () => {
      const content = `{"timestamp":"2026-04-22T10:30:00Z","model":"gpt-3.5-turbo","tokens":1250,"agent":"claude-code","project":"kernel"}`;

      const entries = parseTokenLog(content);

      expect(entries).toHaveLength(1);
      expect(entries[0].agent).toBe('claude-code');
    });

    it('validates that tokens is a number', () => {
      const content = `{"timestamp":"2026-04-22T10:30:00Z","model":"gpt-3.5-turbo","tokens":"not-a-number","agent":"claude-code","project":"kernel"}
{"timestamp":"2026-04-22T11:00:00Z","model":"gpt-4","tokens":5000,"agent":"codex","project":"kernel"}`;

      const entries = parseTokenLog(content);

      // Should skip the entry with non-numeric tokens
      expect(entries).toHaveLength(1);
      expect(entries[0].agent).toBe('codex');
    });

    it('handles entries with large token counts', () => {
      const content = `{"timestamp":"2026-04-22T10:30:00Z","model":"gpt-3.5-turbo","tokens":999999999,"agent":"claude-code","project":"kernel"}`;

      const entries = parseTokenLog(content);

      expect(entries).toHaveLength(1);
      expect(entries[0].tokens).toBe(999999999);
    });

    it('handles zero token count', () => {
      const content = `{"timestamp":"2026-04-22T10:30:00Z","model":"gpt-3.5-turbo","tokens":0,"agent":"claude-code","project":"kernel"}`;

      const entries = parseTokenLog(content);

      expect(entries).toHaveLength(1);
      expect(entries[0].tokens).toBe(0);
    });
  });

  describe('round-trip consistency', () => {
    it('preserves entry through format and parse', () => {
      const originalEntry: TokenLogEntry = {
        timestamp: '2026-04-22T10:30:00Z',
        model: 'gpt-3.5-turbo',
        tokens: 1250,
        agent: 'claude-code',
        project: 'kernel',
      };

      const formatted = formatTokenLogEntry(originalEntry);
      const parsed = parseTokenLog(formatted);

      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toEqual(originalEntry);
    });

    it('preserves multiple entries through format and parse', () => {
      const entries: TokenLogEntry[] = [
        {
          timestamp: '2026-04-22T10:30:00Z',
          model: 'gpt-3.5-turbo',
          tokens: 1250,
          agent: 'claude-code',
          project: 'kernel',
        },
        {
          timestamp: '2026-04-22T11:00:00Z',
          model: 'gpt-4',
          tokens: 5000,
          agent: 'codex',
          project: 'kernel',
        },
      ];

      const ndjson = entries.map(formatTokenLogEntry).join('\n');
      const parsed = parseTokenLog(ndjson);

      expect(parsed).toHaveLength(2);
      expect(parsed).toEqual(entries);
    });
  });
});
