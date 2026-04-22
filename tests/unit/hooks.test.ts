import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { injectSessionStartContext } from '../../src/hooks/session-start';
import { logSessionTokens } from '../../src/hooks/session-end';
import { HookContext, SessionEndContext } from '../../src/hooks/types';
import { parseTokenLog } from '../../src/utils/token-tracker';

describe('hooks', () => {
  let testDir: string;

  beforeEach(async () => {
    // Create a temporary directory for each test
    testDir = join(tmpdir(), `kernel-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

  describe('injectSessionStartContext', () => {
    it('creates .session-context file', async () => {
      const context: HookContext = {
        sessionId: 'test-session-1',
        agent: 'claude-code',
        project: 'test-project',
        projectRoot: testDir,
      };

      await injectSessionStartContext(context);

      const contextPath = join(testDir, '.kernel', '.session-context');
      const exists = await fs.stat(contextPath).then(() => true).catch(() => false);

      expect(exists).toBe(true);
    });

    it('.session-context contains markdown heading', async () => {
      const context: HookContext = {
        sessionId: 'test-session-2',
        agent: 'codex',
        project: 'test-project',
        projectRoot: testDir,
      };

      await injectSessionStartContext(context);

      const contextPath = join(testDir, '.kernel', '.session-context');
      const content = await fs.readFile(contextPath, 'utf-8');

      expect(content).toContain('# Project Context (from Kernel)');
    });

    it('.session-context contains memory entries when memory exists', async () => {
      // Create MEMORY.md with test entries
      const memoryDir = join(testDir, '.kernel');
      await fs.mkdir(memoryDir, { recursive: true });
      const memoryPath = join(memoryDir, 'MEMORY.md');

      const memoryContent = `[test-agent | 2026-04-22T10:00:00Z] task_one: completed setup
[test-agent | 2026-04-22T11:00:00Z] task_two: implemented feature
[test-agent | 2026-04-22T12:00:00Z] task_three: fixed bug`;

      await fs.writeFile(memoryPath, memoryContent, 'utf-8');

      const context: HookContext = {
        sessionId: 'test-session-3',
        agent: 'claude-code',
        project: 'test-project',
        projectRoot: testDir,
      };

      await injectSessionStartContext(context);

      const contextPath = join(testDir, '.kernel', '.session-context');
      const content = await fs.readFile(contextPath, 'utf-8');

      // Should contain at least one memory entry
      expect(content).toContain('task_');
      expect(content).toMatch(/- \*\*task_\w+\*\*:/);
    });

    it('.session-context handles missing memory file gracefully', async () => {
      const context: HookContext = {
        sessionId: 'test-session-4',
        agent: 'opencode',
        project: 'test-project',
        projectRoot: testDir,
      };

      // Don't create MEMORY.md
      await injectSessionStartContext(context);

      const contextPath = join(testDir, '.kernel', '.session-context');
      const content = await fs.readFile(contextPath, 'utf-8');

      expect(content).toContain('# Project Context (from Kernel)');
      expect(content).toContain('No previous session context found');
    });

    it('takes only top 5 memory entries by recency', async () => {
      // Create MEMORY.md with more than 5 entries
      const memoryPath = join(testDir, '.kernel', 'MEMORY.md');
      const memoryDir = join(testDir, '.kernel');
      await fs.mkdir(memoryDir, { recursive: true });

      let memoryContent = '';
      for (let i = 1; i <= 10; i++) {
        const timestamp = new Date(Date.now() + i * 1000).toISOString();
        memoryContent += `[test-agent | ${timestamp}] entry_${i}: value_${i}\n`;
      }

      await fs.writeFile(memoryPath, memoryContent, 'utf-8');

      const context: HookContext = {
        sessionId: 'test-session-5',
        agent: 'claude-code',
        project: 'test-project',
        projectRoot: testDir,
      };

      await injectSessionStartContext(context);

      const contextPath = join(testDir, '.kernel', '.session-context');
      const content = await fs.readFile(contextPath, 'utf-8');

      // Count bullet points
      const bulletCount = (content.match(/^- \*\*/gm) || []).length;
      expect(bulletCount).toBeLessThanOrEqual(5);
    });
  });

  describe('logSessionTokens', () => {
    it('appends to token-log.json', async () => {
      const context: SessionEndContext = {
        sessionId: 'test-session-6',
        agent: 'claude-code',
        project: 'test-project',
        projectRoot: testDir,
        sessionContent: 'This is test session content for token counting.',
        model: 'gpt-3.5-turbo',
      };

      await logSessionTokens(context);

      const tokenLogPath = join(testDir, '.kernel', 'token-log.json');
      const exists = await fs.stat(tokenLogPath).then(() => true).catch(() => false);

      expect(exists).toBe(true);
    });

    it('token-log.json contains valid JSON entries', async () => {
      const context: SessionEndContext = {
        sessionId: 'test-session-7',
        agent: 'codex',
        project: 'test-project',
        projectRoot: testDir,
        sessionContent: 'Sample session content with various text.',
        model: 'gpt-4',
      };

      await logSessionTokens(context);

      const tokenLogPath = join(testDir, '.kernel', 'token-log.json');
      const content = await fs.readFile(tokenLogPath, 'utf-8');

      const entries = parseTokenLog(content);

      expect(entries).toHaveLength(1);
      expect(entries[0].agent).toBe('codex');
      expect(entries[0].project).toBe('test-project');
      expect(entries[0].model).toBe('gpt-4');
    });

    it('token count is reasonable', async () => {
      const sessionContent = 'This is test session content for token counting.';
      const context: SessionEndContext = {
        sessionId: 'test-session-8',
        agent: 'claude-code',
        project: 'test-project',
        projectRoot: testDir,
        sessionContent,
        model: 'gpt-3.5-turbo',
      };

      await logSessionTokens(context);

      const tokenLogPath = join(testDir, '.kernel', 'token-log.json');
      const content = await fs.readFile(tokenLogPath, 'utf-8');
      const entries = parseTokenLog(content);

      expect(entries).toHaveLength(1);
      const tokens = entries[0].tokens;

      // Token count should be positive
      expect(tokens).toBeGreaterThan(0);
      // Should be less than character count / 4
      expect(tokens).toBeLessThanOrEqual(Math.ceil(sessionContent.length / 4) + 1);
      // Reasonable upper bound
      expect(tokens).toBeLessThan(100);
    });

    it('appends multiple entries to token-log.json', async () => {
      // First entry
      const context1: SessionEndContext = {
        sessionId: 'test-session-9',
        agent: 'claude-code',
        project: 'test-project',
        projectRoot: testDir,
        sessionContent: 'First session content.',
        model: 'gpt-3.5-turbo',
      };

      await logSessionTokens(context1);

      // Second entry
      const context2: SessionEndContext = {
        sessionId: 'test-session-10',
        agent: 'codex',
        project: 'test-project',
        projectRoot: testDir,
        sessionContent: 'Second session content with more information.',
        model: 'gpt-4',
      };

      await logSessionTokens(context2);

      const tokenLogPath = join(testDir, '.kernel', 'token-log.json');
      const content = await fs.readFile(tokenLogPath, 'utf-8');
      const entries = parseTokenLog(content);

      expect(entries).toHaveLength(2);
      expect(entries[0].agent).toBe('claude-code');
      expect(entries[1].agent).toBe('codex');
    });

    it('stores correct metadata in token log', async () => {
      const context: SessionEndContext = {
        sessionId: 'test-session-11',
        agent: 'opencode',
        project: 'my-kernel-project',
        projectRoot: testDir,
        sessionContent: 'Test content for metadata verification.',
        model: 'claude-3-sonnet',
      };

      await logSessionTokens(context);

      const tokenLogPath = join(testDir, '.kernel', 'token-log.json');
      const content = await fs.readFile(tokenLogPath, 'utf-8');
      const entries = parseTokenLog(content);

      expect(entries).toHaveLength(1);
      const entry = entries[0];

      expect(entry.agent).toBe('opencode');
      expect(entry.project).toBe('my-kernel-project');
      expect(entry.model).toBe('claude-3-sonnet');
      expect(entry.tokens).toBeGreaterThan(0);
    });

    it('timestamp is ISO 8601 format', async () => {
      const context: SessionEndContext = {
        sessionId: 'test-session-12',
        agent: 'claude-code',
        project: 'test-project',
        projectRoot: testDir,
        sessionContent: 'Content for timestamp test.',
        model: 'gpt-3.5-turbo',
      };

      await logSessionTokens(context);

      const tokenLogPath = join(testDir, '.kernel', 'token-log.json');
      const content = await fs.readFile(tokenLogPath, 'utf-8');
      const entries = parseTokenLog(content);

      expect(entries).toHaveLength(1);
      const timestamp = entries[0].timestamp;

      // ISO 8601 format check (includes optional milliseconds)
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
      // Verify it's a valid date
      expect(() => new Date(timestamp)).not.toThrow();
    });

    it('creates .kernel directory if missing', async () => {
      // Verify .kernel doesn't exist
      const kernelDir = join(testDir, '.kernel');
      const existsBefore = await fs.stat(kernelDir).then(() => true).catch(() => false);
      expect(existsBefore).toBe(false);

      const context: SessionEndContext = {
        sessionId: 'test-session-13',
        agent: 'claude-code',
        project: 'test-project',
        projectRoot: testDir,
        sessionContent: 'Test content.',
        model: 'gpt-3.5-turbo',
      };

      await logSessionTokens(context);

      // Verify .kernel exists now
      const existsAfter = await fs.stat(kernelDir).then(() => true).catch(() => false);
      expect(existsAfter).toBe(true);
    });
  });
});
